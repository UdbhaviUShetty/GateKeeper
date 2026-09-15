import { Redis } from "ioredis";
import { randomUUID } from "crypto";
import {
  RateLimiter,
  RateLimitResult,
  SlidingWindowConfig,
} from "../types/rate-limit";

export class RedisSlidingWindowLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(
    clientId: string,
    config: SlidingWindowConfig
  ): Promise<RateLimitResult> {
    const key = `rate_limit:sliding_window:${clientId}`;
    // TTL just needs to cover the window itself — once the window has fully
    // elapsed with no new requests, there's nothing left to track.
    const ttl = config.windowSeconds + 5;

    // Member must be unique per request (two requests can share the exact
    // same millisecond timestamp under load), otherwise ZADD would silently
    // overwrite one request's entry with another's instead of recording both.
    const member = `${Date.now()}:${randomUUID()}`;

    const [allowed, remainingStr, retryAfterStr, resetAtStr] =
      await this.redis.slidingWindow(
        key,
        config.limit,
        config.windowSeconds,
        member,
        ttl
      );

    return {
      allowed: allowed === 1,
      remaining: Number(remainingStr),
      limit: config.limit,
      resetAt: Number(resetAtStr),
      retryAfterSeconds: allowed === 1 ? undefined : Number(retryAfterStr),
    };
  }
}
