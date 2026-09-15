import { describe, it, expect } from "vitest";
import { decideTokenBucket } from "../src/rate-limiters/token-bucket.pure";
import { TokenBucketConfig } from "../src/types/rate-limit";

const config: TokenBucketConfig = {
  algorithm: "token-bucket",
  burstCapacity: 10,
  refillRate: 2, // 2 tokens/sec
};

describe("decideTokenBucket (pure algorithm)", () => {
  it("starts full for a new client and allows the first request", () => {
    const result = decideTokenBucket(null, 1000, config);
    expect(result.allowed).toBe(true);
    expect(result.state.tokens).toBe(9); // 10 - 1
  });

  it("consumes one token per allowed request with no elapsed time", () => {
    let state = decideTokenBucket(null, 1000, config).state;
    for (let i = 0; i < 8; i++) {
      const result = decideTokenBucket(state, 1000, config); // same timestamp, no refill
      expect(result.allowed).toBe(true);
      state = result.state;
    }
    // Started at 9 after first call, consumed 8 more => 1 left.
    expect(state.tokens).toBeCloseTo(1, 5);
  });

  it("blocks once the bucket is exhausted", () => {
    let state = decideTokenBucket(null, 1000, config).state; // 9 left
    for (let i = 0; i < 9; i++) {
      state = decideTokenBucket(state, 1000, config).state; // drain to 0
    }
    const blocked = decideTokenBucket(state, 1000, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refills tokens proportionally to elapsed time", () => {
    // Drain the bucket completely at t=1000.
    let state = decideTokenBucket(null, 1000, config).state;
    for (let i = 0; i < 9; i++) {
      state = decideTokenBucket(state, 1000, config).state;
    }
    expect(state.tokens).toBeCloseTo(0, 5);

    // 2 seconds later, refill rate is 2/sec => +4 tokens.
    const result = decideTokenBucket(state, 1000 + 2000, config);
    expect(result.allowed).toBe(true);
    // 0 + 4 refilled - 1 consumed = 3
    expect(result.state.tokens).toBeCloseTo(3, 5);
  });

  it("never refills above burstCapacity", () => {
    let state = decideTokenBucket(null, 1000, config).state; // 9
    // Huge elapsed time — should cap at capacity, not overflow.
    const result = decideTokenBucket(state, 1000 + 1_000_000, config);
    expect(result.allowed).toBe(true);
    expect(result.state.tokens).toBeLessThanOrEqual(config.burstCapacity - 1);
  });

  it("allows a full burst up to capacity at once", () => {
    let state = decideTokenBucket(null, 1000, config).state;
    let allowedCount = 1; // the initial call above already consumed one
    for (let i = 0; i < 20; i++) {
      const result = decideTokenBucket(state, 1000, config);
      if (result.allowed) allowedCount++;
      state = result.state;
      if (!result.allowed) break;
    }
    expect(allowedCount).toBe(config.burstCapacity);
  });

  it("computes a sensible retryAfterSeconds when blocked", () => {
    let state = decideTokenBucket(null, 1000, config).state;
    for (let i = 0; i < 9; i++) {
      state = decideTokenBucket(state, 1000, config).state;
    }
    const blocked = decideTokenBucket(state, 1000, config);
    // Needs 1 full token at 2 tokens/sec => 0.5s => ceil to 1s.
    expect(blocked.retryAfterSeconds).toBe(1);
  });
});
