import { Request, Response, NextFunction } from "express";
import { RateLimiterRegistry } from "../rate-limiters";
import { MetricsService } from "../services/metrics.service";
import { logger } from "../utils/logger";

/**
 * Applies the client's configured rate limiter, sets the standard
 * X-RateLimit-* headers on every response, and short-circuits with 429 when
 * the client is over their limit.
 *
 * Headers follow the (widely used, though not formally standardized)
 * convention:
 *   X-RateLimit-Limit     — the client's configured ceiling
 *   X-RateLimit-Remaining — how many requests/tokens are left right now
 *   X-RateLimit-Reset     — unix seconds when the allowance meaningfully resets
 * On a 429, we also send the standard `Retry-After` header (this one IS a
 * real HTTP standard, RFC 9110) telling the client how many seconds to wait.
 */
export function createRateLimitMiddleware(
  registry: RateLimiterRegistry,
  metrics: MetricsService
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const record = req.apiKeyRecord;
    if (!record) {
      // Should be unreachable if auth middleware runs first, but fail closed.
      return res.status(401).json({ error: "unauthorized", message: "Missing API key context." });
    }

    let result;
    try {
      result = await registry.consume(record.id, record.config);
    } catch (err) {
      // Redis is unreachable or the script errored. We FAIL OPEN here: a
      // rate limiter that's down should not take the whole gateway down
      // with it — an unenforced limit for a few seconds is a much smaller
      // problem than every client getting 500s. This is a documented
      // tradeoff (see README "Failure Modes") — a stricter system might
      // choose to fail closed instead.
      logger.error("rate limiter failure, failing open", {
        requestId: req.requestId,
        apiKeyId: record.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return next();
    }

    res.setHeader("X-RateLimit-Limit", String(result.limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, Math.floor(result.remaining))));
    res.setHeader("X-RateLimit-Reset", String(result.resetAt));

    await metrics.recordRequest(record.id, result.allowed);

    if (!result.allowed) {
      const retryAfter = result.retryAfterSeconds ?? 1;
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "rate_limit_exceeded",
        message: "Too many requests",
        retryAfter,
      });
    }

    next();
  };
}
