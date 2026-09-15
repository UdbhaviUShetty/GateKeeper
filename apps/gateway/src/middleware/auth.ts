import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../services/api-key.service";

/**
 * Extracts and validates the client's API key, then attaches the resolved
 * key record to the request so downstream middleware (rate limiter, proxy,
 * metrics) can use it without re-querying Redis.
 *
 * Header convention: `Authorization: Bearer <key>` — same convention most
 * real APIs use, so it's a familiar pattern to discuss in interviews.
 */
export function createAuthMiddleware(apiKeyService: ApiKeyService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("Authorization");
    const rawKey = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!rawKey) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Missing API key. Send it as: Authorization: Bearer <key>",
      });
    }

    const record = await apiKeyService.findByRawKey(rawKey);
    if (!record) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Invalid API key.",
      });
    }

    // We intentionally store the resolved *record*, not the raw key, on the
    // request — nothing downstream ever needs the plaintext key again, and
    // this keeps it out of anything that might get logged.
    req.apiKeyRecord = record;
    req.apiKeyId = record.id;
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      apiKeyRecord?: import("../services/api-key.service").ApiKeyRecord;
    }
  }
}
