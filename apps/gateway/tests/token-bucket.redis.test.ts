import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestRedis, flushTestRedis } from "./setup";
import { RedisTokenBucketLimiter } from "../src/rate-limiters/token-bucket.redis";
import { TokenBucketConfig } from "../src/types/rate-limit";

const redis = createTestRedis();
const limiter = new RedisTokenBucketLimiter(redis);

const config: TokenBucketConfig = {
  algorithm: "token-bucket",
  burstCapacity: 5,
  refillRate: 100, // fast refill so we don't need real sleeps in most tests
};

beforeEach(async () => {
  await flushTestRedis(redis);
});

afterAll(async () => {
  await redis.quit();
});

describe("RedisTokenBucketLimiter (real Redis via Lua script)", () => {
  it("allows requests up to burst capacity, then blocks", async () => {
    const clientId = "client-a";
    // Use a refill rate of ~0 in practice by draining fast relative to time elapsed —
    // instead, use a config with negligible refill within this test's execution window.
    const slowConfig: TokenBucketConfig = { algorithm: "token-bucket", burstCapacity: 5, refillRate: 0.001 };

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await limiter.consume(clientId, slowConfig));
    }

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(5);
    expect(results[5].allowed).toBe(false);
    expect(results[5].retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps independent state per client", async () => {
    const slowConfig: TokenBucketConfig = { algorithm: "token-bucket", burstCapacity: 2, refillRate: 0.001 };

    await limiter.consume("client-x", slowConfig);
    await limiter.consume("client-x", slowConfig);
    const clientXBlocked = await limiter.consume("client-x", slowConfig);
    expect(clientXBlocked.allowed).toBe(false);

    // A different client should be unaffected.
    const clientYResult = await limiter.consume("client-y", slowConfig);
    expect(clientYResult.allowed).toBe(true);
  });

  it("refills tokens over real elapsed time", async () => {
    const clientId = "refill-client";
    const fastRefillConfig: TokenBucketConfig = { algorithm: "token-bucket", burstCapacity: 1, refillRate: 5 }; // 5/sec

    const first = await limiter.consume(clientId, fastRefillConfig);
    expect(first.allowed).toBe(true);

    const immediatelyAfter = await limiter.consume(clientId, fastRefillConfig);
    expect(immediatelyAfter.allowed).toBe(false);

    // Wait 300ms — at 5 tokens/sec that's 1.5 tokens refilled, enough for 1.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const afterWait = await limiter.consume(clientId, fastRefillConfig);
    expect(afterWait.allowed).toBe(true);
  });

  it("does not allow two concurrent requests to consume the same last token", async () => {
    // This is the race condition the Lua script exists to prevent. We fire
    // many concurrent consume() calls at a bucket that only has 1 token,
    // and assert that Redis's atomicity means exactly 1 is allowed — not 0,
    // not 2+.
    const clientId = "race-client";
    const raceConfig: TokenBucketConfig = { algorithm: "token-bucket", burstCapacity: 1, refillRate: 0.001 };

    const concurrentRequests = 20;
    const results = await Promise.all(
      Array.from({ length: concurrentRequests }, () => limiter.consume(clientId, raceConfig))
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(1);
  });

  it("returns correct rate-limit headers-worth of data", async () => {
    const result = await limiter.consume("header-client", config);
    expect(result.limit).toBe(config.burstCapacity);
    expect(result.remaining).toBeLessThanOrEqual(config.burstCapacity);
    expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000) - 5);
  });
});
