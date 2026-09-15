import { createApp } from "./app";
import { env } from "./config/env";
import { redis, checkRedisConnection } from "./redis/client";
import { seedDemoApiKeys, ApiKeyService } from "./services/api-key.service";
import { logger } from "./utils/logger";

async function bootstrap() {
  const app = createApp(redis);

  const connected = await checkRedisConnection();
  if (!connected) {
    logger.warn("starting without a confirmed redis connection — rate limiting will fail open until it connects");
  }

  // Seed demo clients so the gateway is immediately usable. Real deployments
  // wouldn't do this — it exists purely so this portfolio project is
  // demonstrable without extra setup steps.
  try {
    const seeded = await seedDemoApiKeys(new ApiKeyService(redis), redis);
    if (seeded) {
      logger.info("seeded demo API keys", {
        note: "save these — they are shown only once",
        demoClientKey: seeded.demoKey,
        strictClientKey: seeded.strictKey,
      });
    }
  } catch (err) {
    logger.warn("could not seed demo api keys (redis unavailable?)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const server = app.listen(env.port, () => {
    logger.info(`gateway listening`, { port: env.port, env: env.nodeEnv });
  });

  const shutdown = async (signal: string) => {
    logger.info("shutting down gracefully", { signal });
    server.close(() => logger.info("http server closed"));
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap();
