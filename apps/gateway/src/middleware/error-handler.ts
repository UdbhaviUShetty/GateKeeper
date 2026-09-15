import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Centralized error handler — the last middleware in the chain. Anything
 * thrown or passed to next(err) anywhere in the app ends up here, so error
 * response shape stays consistent instead of every route hand-rolling its
 * own try/catch + JSON response.
 *
 * We deliberately don't leak internal error details (stack traces, Redis
 * error messages) to the client — only a generic message and the request ID
 * so the person reporting the bug can correlate it with server-side logs.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error("unhandled error", {
    requestId: req.requestId,
    path: req.path,
    error: err.message,
  });

  if (res.headersSent) return;

  res.status(500).json({
    error: "internal_error",
    message: "Something went wrong on our end.",
    requestId: req.requestId,
  });
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  res.on("finish", () => {
    logger.info("request completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: Date.now() - startedAt,
      apiKeyId: req.apiKeyId, // never logs the raw key, only its id
    });
  });
  next();
}
