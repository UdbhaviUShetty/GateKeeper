import { Router, Request, Response } from "express";
import { MetricsService } from "../services/metrics.service";
import { ApiKeyService } from "../services/api-key.service";

/**
 * Read-only metrics endpoints the dashboard polls.
 *
 * SIMPLIFICATION: unauthenticated for this portfolio project, since it's
 * read-only aggregate data and keeps the dashboard demo frictionless. A
 * production system would put this behind the same auth as other admin
 * surfaces (or a separate read-scoped token).
 */
export function createMetricsRouter(metrics: MetricsService, apiKeyService: ApiKeyService): Router {
  const router = Router();

  router.get("/overview", async (_req: Request, res: Response) => {
    const overview = await metrics.getOverview();
    res.json(overview);
  });

  router.get("/clients", async (_req: Request, res: Response) => {
    const stats = await metrics.getPerClientStats(apiKeyService);
    res.json(stats);
  });

  return router;
}
