/**
 * The result every rate limiter (regardless of algorithm) returns.
 * Keeping this shape algorithm-agnostic is what lets the Express middleware
 * stay completely unaware of whether Token Bucket or Sliding Window decided
 * the outcome — it just reads this object and reacts.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Requests/tokens the client has left right now (after this decision). */
  remaining: number;
  /** The configured limit, echoed back for the X-RateLimit-Limit header. */
  limit: number;
  /** Unix seconds at which the client's allowance is next meaningfully different. */
  resetAt: number;
  /** Only meaningful when allowed === false: seconds the client should wait. */
  retryAfterSeconds?: number;
}

export type Algorithm = "token-bucket" | "sliding-window";

export interface TokenBucketConfig {
  algorithm: "token-bucket";
  burstCapacity: number; // max tokens in the bucket
  refillRate: number; // tokens per second
}

export interface SlidingWindowConfig {
  algorithm: "sliding-window";
  limit: number; // max requests in the window
  windowSeconds: number;
}

export type RateLimitConfig = TokenBucketConfig | SlidingWindowConfig;

/**
 * Every algorithm implements this interface. The gateway middleware depends
 * only on this — not on Redis, not on Lua, not on the specific algorithm.
 * This is what lets us swap/add algorithms without touching request handling.
 */
export interface RateLimiter {
  consume(clientId: string, config: RateLimitConfig): Promise<RateLimitResult>;
}
