import express, { Express } from "express";
import cors from "cors";
import { Redis } from "ioredis";
import { healthRouter } from "./routes/health";
import { createAdminRouter } from "./routes/admin";
import { createMetricsRouter } from "./routes/metrics";
import { ApiKeyService } from "./services/api-key.service";
import { MetricsService } from "./services/metrics.service";
import { RateLimiterRegistry } from "./rate-limiters";
import { requestIdMiddleware } from "./middleware/request-id";
import { requestLoggerMiddleware, errorHandler } from "./middleware/error-handler";
import { createAuthMiddleware } from "./middleware/auth";
import { createRateLimitMiddleware } from "./middleware/rate-limit";
import { backendProxy } from "./proxy/proxy";

/**
 * createApp() vs listen(): keeping app construction separate from binding a
 * port is what lets tests build a full Express app (with real middleware
 * wired to a real, injected Redis client) and hit it with Supertest,
 * without needing an actual open socket.
 *
 * Redis is passed in rather than imported as a singleton so tests can
 * inject a client pointed at a disposable test database/prefix if needed.
 */
export function createApp(redis: Redis): Express {
  const app = express();

  const apiKeyService = new ApiKeyService(redis);
  const metricsService = new MetricsService(redis);
  const rateLimiterRegistry = new RateLimiterRegistry(redis);

  app.use(cors());
  // IMPORTANT: express.json() is intentionally NOT applied globally.
  // Body-parsing middleware consumes the request stream — if it ran before
  // the proxy, http-proxy-middleware would have nothing left to forward to
  // the backend (the backend would hang waiting for a body that never
  // arrives). We only need JSON parsing for our own admin routes, so it's
  // scoped there instead of applied to every request.
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  app.use(healthRouter);
  app.use("/admin", express.json({ limit: "100kb" }), createAdminRouter(apiKeyService, metricsService));
  app.use("/metrics", createMetricsRouter(metricsService, apiKeyService));

  // Everything under /api/* requires a valid API key and passes through the
  // rate limiter before reaching the proxy. This is the gateway's core
  // request pipeline: auth -> rate limit -> proxy.
  app.use(
    "/api",
    createAuthMiddleware(apiKeyService),
    createRateLimitMiddleware(rateLimiterRegistry, metricsService),
    backendProxy
  );

  app.use(errorHandler);

  return app;
}
