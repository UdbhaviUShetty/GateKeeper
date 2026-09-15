import { Router, Request, Response } from "express";
import { ApiKeyService } from "../services/api-key.service";
import { MetricsService } from "../services/metrics.service";
import { RateLimitConfig } from "../types/rate-limit";
import { adminAuthMiddleware } from "../middleware/admin-auth";

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidConfig(config: unknown): config is RateLimitConfig {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;
  if (c.algorithm === "token-bucket") {
    // Both must be strictly positive: a zero or negative refillRate would
    // divide by zero inside the Token Bucket Lua script's retry/reset math,
    // and a zero-or-negative burstCapacity would create a client that can
    // never be allowed a single request.
    return isPositiveFiniteNumber(c.burstCapacity) && isPositiveFiniteNumber(c.refillRate);
  }
  if (c.algorithm === "sliding-window") {
    return isPositiveFiniteNumber(c.limit) && isPositiveFiniteNumber(c.windowSeconds);
  }
  return false;
}

export function createAdminRouter(apiKeyService: ApiKeyService, metrics: MetricsService): Router {
  const router = Router();
  router.use(adminAuthMiddleware);

  // POST /admin/api-keys — create a new client. Plaintext key is returned
  // ONLY in this response; it is never retrievable again.
  router.post("/api-keys", async (req: Request, res: Response) => {
    const { name, config } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "invalid_request", message: "`name` is required." });
    }
    if (!isValidConfig(config)) {
      return res.status(400).json({
        error: "invalid_request",
        message:
          "`config` must be a valid RateLimitConfig (token-bucket: burstCapacity + refillRate, or sliding-window: limit + windowSeconds).",
      });
    }

    const { record, plaintextKey } = await apiKeyService.create({ name, config });
    return res.status(201).json({
      id: record.id,
      name: record.name,
      algorithm: record.config.algorithm,
      config: record.config,
      createdAt: record.createdAt,
      plaintextKey, // shown once
    });
  });

  // GET /admin/api-keys — list all clients (never returns key hashes or plaintext).
  router.get("/api-keys", async (_req: Request, res: Response) => {
    const keys = await apiKeyService.list();
    return res.json(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        algorithm: k.config.algorithm,
        config: k.config,
        createdAt: k.createdAt,
      }))
    );
  });

  // GET /admin/api-keys/:id
  router.get("/api-keys/:id", async (req: Request, res: Response) => {
    const record = await apiKeyService.getById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "not_found", message: "API key not found." });
    }
    return res.json({
      id: record.id,
      name: record.name,
      algorithm: record.config.algorithm,
      config: record.config,
      createdAt: record.createdAt,
    });
  });

  // PATCH /admin/api-keys/:id/limits — update rate-limit configuration.
  router.patch("/api-keys/:id/limits", async (req: Request, res: Response) => {
    const { config } = req.body ?? {};
    if (!isValidConfig(config)) {
      return res.status(400).json({ error: "invalid_request", message: "Invalid `config`." });
    }
    const updated = await apiKeyService.updateLimits(req.params.id, config);
    if (!updated) {
      return res.status(404).json({ error: "not_found", message: "API key not found." });
    }
    return res.json({
      id: updated.id,
      name: updated.name,
      algorithm: updated.config.algorithm,
      config: updated.config,
      createdAt: updated.createdAt,
    });
  });

  // GET /admin/api-keys/:id/stats
  router.get("/api-keys/:id/stats", async (req: Request, res: Response) => {
    const record = await apiKeyService.getById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "not_found", message: "API key not found." });
    }
    const stats = await metrics.getPerClientStats(apiKeyService);
    const clientStats = stats.find((s) => s.id === req.params.id);
    return res.json(clientStats);
  });

  return router;
}
