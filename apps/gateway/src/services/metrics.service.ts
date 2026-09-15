import { Redis } from "ioredis";
import { ApiKeyService } from "./api-key.service";

/**
 * Records and reads gateway usage metrics.
 *
 * This is deliberately behind a small interface-shaped class (not scattered
 * `redis.incr()` calls throughout the middleware) so it could later be
 * swapped for a Prometheus client or OpenTelemetry metrics exporter without
 * touching any call site — only this file would change.
 *
 * State lives in Redis (not process memory) for the same reason rate-limit
 * state does: multiple gateway instances need to contribute to the same
 * counters.
 */
export class MetricsService {
  constructor(private readonly redis: Redis) {}

  async recordRequest(clientId: string, allowed: boolean): Promise<void> {
    const now = Date.now();
    const pipeline = this.redis.pipeline();

    pipeline.incr("metrics:total");
    pipeline.incr(allowed ? "metrics:allowed" : "metrics:blocked");
    pipeline.hincrby(`metrics:client:${clientId}`, "total", 1);
    pipeline.hincrby(`metrics:client:${clientId}`, allowed ? "allowed" : "blocked", 1);

    // Sliding 10-second timeline of request timestamps, used to derive an
    // approximate live requests/sec figure for the dashboard.
    pipeline.zadd("metrics:timeline", now, `${now}:${Math.random()}`);
    pipeline.zremrangebyscore("metrics:timeline", "-inf", now - 10_000);

    await pipeline.exec();
  }

  async getRequestsPerSecond(): Promise<number> {
    const now = Date.now();
    // Count timeline entries in the last 5 seconds and average — smooths
    // out single-second spikes while still feeling "live" when polled.
    const count = await this.redis.zcount("metrics:timeline", now - 5000, now);
    return Math.round((count / 5) * 10) / 10;
  }

  async getOverview() {
    const [totalStr, allowedStr, blockedStr, rps] = await Promise.all([
      this.redis.get("metrics:total"),
      this.redis.get("metrics:allowed"),
      this.redis.get("metrics:blocked"),
      this.getRequestsPerSecond(),
    ]);

    const total = Number(totalStr ?? 0);
    const allowed = Number(allowedStr ?? 0);
    const blocked = Number(blockedStr ?? 0);

    return {
      totalRequests: total,
      allowedRequests: allowed,
      blockedRequests: blocked,
      requestsPerSecond: rps,
      allowedPercentage: total > 0 ? Math.round((allowed / total) * 1000) / 10 : 0,
      blockedPercentage: total > 0 ? Math.round((blocked / total) * 1000) / 10 : 0,
      timestamp: new Date().toISOString(),
    };
  }

  async getPerClientStats(apiKeyService: ApiKeyService) {
    const keys = await apiKeyService.list();
    const stats = await Promise.all(
      keys.map(async (key) => {
        const data = await this.redis.hgetall(`metrics:client:${key.id}`);
        return {
          id: key.id,
          name: key.name,
          algorithm: key.config.algorithm,
          config: key.config,
          totalRequests: Number(data.total ?? 0),
          allowedRequests: Number(data.allowed ?? 0),
          blockedRequests: Number(data.blocked ?? 0),
        };
      })
    );
    return stats;
  }
}
