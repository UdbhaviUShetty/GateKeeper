import { TokenBucketConfig } from "../types/rate-limit";

export interface TokenBucketState {
  tokens: number;
  lastRefillMs: number; // epoch ms of the last time tokens were recalculated
}

export interface TokenBucketDecision {
  allowed: boolean;
  state: TokenBucketState; // the state to persist after this decision
  retryAfterSeconds?: number;
}

/**
 * Pure Token Bucket math — no Express, no Redis, no I/O.
 *
 * This is intentionally separated from the Redis-backed limiter so the
 * *algorithm* can be unit tested directly (feed it a state + elapsed time,
 * assert the output) without needing a Redis connection. The Redis Lua
 * script in token-bucket.lua re-implements this same logic atomically —
 * this file is the reference implementation and what we test against.
 */
export function decideTokenBucket(
  state: TokenBucketState | null,
  nowMs: number,
  config: TokenBucketConfig
): TokenBucketDecision {
  const { burstCapacity, refillRate } = config;

  // A client with no prior state starts with a full bucket. This is a
  // deliberate choice: new clients get a full burst allowance immediately
  // rather than an empty bucket that fills up over time.
  const previous: TokenBucketState = state ?? {
    tokens: burstCapacity,
    lastRefillMs: nowMs,
  };

  const elapsedSeconds = Math.max(0, (nowMs - previous.lastRefillMs) / 1000);
  const refilled = previous.tokens + elapsedSeconds * refillRate;
  const tokens = Math.min(burstCapacity, refilled);

  if (tokens >= 1) {
    return {
      allowed: true,
      state: { tokens: tokens - 1, lastRefillMs: nowMs },
    };
  }

  // Not enough tokens. Calculate how long until at least 1 token is available.
  const deficit = 1 - tokens;
  const retryAfterSeconds = Math.ceil(deficit / refillRate);

  return {
    allowed: false,
    // We still persist the refilled (but unconsumed) token count and the
    // refill timestamp — otherwise a rejected request would "lose" the
    // partial refill that happened since the last successful request.
    state: { tokens, lastRefillMs: nowMs },
    retryAfterSeconds,
  };
}
