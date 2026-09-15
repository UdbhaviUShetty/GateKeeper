import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestRedis, flushTestRedis } from "./setup";
import { RedisSlidingWindowLimiter } from "../src/rate-limiters/sliding-window.redis";
import { SlidingWindowConfig } from "../src/types/rate-limit";

const redis = createTestRedis();
const limiter = new RedisSlidingWindowLimiter(redis);

const config: SlidingWindowConfig = {
  algorithm: "sliding-window",
  limit: 5,
  windowSeconds: 2,
};

beforeEach(async () => {
  await flushTestRedis(redis);
});

afterAll(async () => {
  await redis.quit();
});

describe("RedisSlidingWindowLimiter (real Redis via Lua script)", () => {
  it("allows requests up to the limit within the window", async () => {
    const clientId = "sw-client-a";
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await limiter.consume(clientId, config));
    }
    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(5);
    expect(results[5].allowed).toBe(false);
  });

  it("keeps independent windows per client", async () => {
    for (let i = 0; i < 5; i++) await limiter.consume("sw-x", config);
    const blocked = await limiter.consume("sw-x", config);
    expect(blocked.allowed).toBe(false);

    const otherClient = await limiter.consume("sw-y", config);
    expect(otherClient.allowed).toBe(true);
  });

  it("allows new requests once old ones roll out of the window", async () => {
    const clientId = "sw-rolling";
    const shortWindowConfig: SlidingWindowConfig = {
      algorithm: "sliding-window",
      limit: 2,
      windowSeconds: 1,
    };

    await limiter.consume(clientId, shortWindowConfig);
    await limiter.consume(clientId, shortWindowConfig);
    const blocked = await limiter.consume(clientId, shortWindowConfig);
    expect(blocked.allowed).toBe(false);

    // Wait past the 1-second window.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const afterWindow = await limiter.consume(clientId, shortWindowConfig);
    expect(afterWindow.allowed).toBe(true);
  });

  it("does not let concurrent requests exceed the limit (race condition check)", async () => {
    const clientId = "sw-race";
    const raceConfig: SlidingWindowConfig = { algorithm: "sliding-window", limit: 3, windowSeconds: 5 };

    const results = await Promise.all(
      Array.from({ length: 15 }, () => limiter.consume(clientId, raceConfig))
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(3);
  });

  it("provides a positive retryAfterSeconds when blocked", async () => {
    const clientId = "sw-retry";
    for (let i = 0; i < 5; i++) await limiter.consume(clientId, config);
    const blocked = await limiter.consume(clientId, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(config.windowSeconds);
  });
});
