import { Redis } from "ioredis";
import fs from "fs";
import path from "path";

/**
 * A dedicated Redis client for tests, pointed at Redis DB 15 (separate from
 * the default DB 0 the dev server uses) so test runs never collide with
 * data from `npm run dev`. We register the same Lua scripts as the app's
 * real client — tests exercise the actual scripts, not a mock of them.
 */
export function createTestRedis(): Redis {
  const redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
    db: 15,
  });

  const loadLua = (file: string) =>
    fs.readFileSync(path.join(__dirname, "../src/redis/lua", file), "utf-8");

  redis.defineCommand("tokenBucket", { numberOfKeys: 1, lua: loadLua("token-bucket.lua") });
  redis.defineCommand("slidingWindow", { numberOfKeys: 1, lua: loadLua("sliding-window.lua") });

  return redis;
}

export async function flushTestRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}
