import { createProxyMiddleware } from "http-proxy-middleware";
import { Request } from "express";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Reverse proxy to the dummy backend. We use `http-proxy-middleware`
 * (a well-maintained wrapper around Node's http module) rather than hand-
 * rolling stream piping — the interesting, resume-relevant engineering here
 * is the rate limiting, not reimplementing HTTP forwarding.
 *
 * This only runs for requests that already passed auth + rate limiting, so
 * by the time a request reaches the proxy, the gateway has already decided
 * it's allowed through.
 */
export const backendProxy = createProxyMiddleware({
  changeOrigin: true,
  // Express strips the "/api" mount prefix before this middleware ever sees
  // the request (req.url here is "/hello", not "/api/hello"), so we have to
  // add it back — the backend's routes are defined at /api/*.
  pathRewrite: (path) => `/api${path}`,
  // Using `router` (evaluated per-request) rather than a static `target`
  // (evaluated once when this middleware is created) means the backend URL
  // is read fresh on every request. In production this makes no practical
  // difference since BACKEND_URL doesn't change at runtime — but it matters
  // for tests, which spin up a throwaway backend on a random port and need
  // the proxy to pick that up rather than a value baked in at import time.
  router: () => process.env.BACKEND_URL ?? env.backendUrl,
  on: {
    proxyReq: (proxyReq, req) => {
      const expressReq = req as Request;
      // Propagate the request ID so backend logs can be correlated with
      // gateway logs for the same request.
      if (expressReq.requestId) {
        proxyReq.setHeader("X-Request-ID", expressReq.requestId);
      }
    },
    error: (err, _req, res) => {
      logger.error("proxy error, upstream unreachable", { error: err.message });
      // 502 Bad Gateway is the correct status here: the gateway itself is
      // fine, but the upstream it depends on failed or is unreachable.
      if ("writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: "bad_gateway", message: "Upstream backend is unavailable" }));
    },
  },
});
