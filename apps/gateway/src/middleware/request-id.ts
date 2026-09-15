import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// Augment Express's Request type so `req.requestId` is type-safe everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      apiKeyId?: string;
    }
  }
}

/**
 * Every request gets a unique ID, propagated to the backend via
 * X-Request-ID and included in every log line for that request. When
 * something goes wrong, you can grep gateway logs and backend logs for the
 * same ID and see the full picture of one request's journey — this is the
 * cheapest form of distributed tracing you can build.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("X-Request-ID");
  req.requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
}
