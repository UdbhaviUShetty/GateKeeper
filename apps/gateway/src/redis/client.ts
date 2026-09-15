import Redis from "ioredis";
import fs from "fs";
import path from "path";
import { env } from "../config/env";

/**
 * Single shared Redis connection for the gateway process.
 *
 * We create one client and reuse it everywhere, rather than opening a new
 * connection per request. Connections are relatively expensive to establish,
 * and ioredis's client is safe to share across concurrent async operations.
 */
export const redis = new Redis(env.redisUrl, {
  // Keep retrying with backoff instead of crashing the process on a blip.
  retryStrategy(times: number) {
    const delayMs = Math.min(times * 200, 2000);
    return delayMs;
  },
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => {
  console.log("[redis] connected");
});

redis.on("error", (err: Error) => {
  console.error("[redis] connection error:", err.message);
});

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

/**
 * Registers our Lua scripts as first-class ioredis commands (e.g.
 * `redis.tokenBucket(...)`). ioredis caches scripts server-side via EVALSHA
 * under the hood, so repeated calls don't re-send the full script body.
 *
 * We declare each script's `numberOfKeys` so ioredis knows how to split
 * KEYS[] from ARGV[] when we call the generated method.
 */
function loadLuaScript(filename: string): string {
  return fs.readFileSync(path.join(__dirname, "lua", filename), "utf-8");
}

redis.defineCommand("tokenBucket", {
  numberOfKeys: 1,
  lua: loadLuaScript("token-bucket.lua"),
});

redis.defineCommand("slidingWindow", {
  numberOfKeys: 1,
  lua: loadLuaScript("sliding-window.lua"),
});

// Augment ioredis's type with our custom commands so callers get type safety
// instead of calling through `as any`.
declare module "ioredis" {
  interface RedisCommander<Context> {
    tokenBucket(
      key: string,
      capacity: number,
      refillRate: number,
      ttlSeconds: number
    ): Promise<[number, string, string, string]>;

    slidingWindow(
      key: string,
      limit: number,
      windowSeconds: number,
      member: string,
      ttlSeconds: number
    ): Promise<[number, string, string, string]>;
  }
}
