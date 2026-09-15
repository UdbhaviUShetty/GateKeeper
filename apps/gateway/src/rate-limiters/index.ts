import { Redis } from "ioredis";
import { RateLimiter, RateLimitConfig, RateLimitResult } from "../types/rate-limit";
import { RedisTokenBucketLimiter } from "./token-bucket.redis";
import { RedisSlidingWindowLimiter } from "./sliding-window.redis";

/**
 * Picks the right algorithm implementation per-request based on the
 * client's configured algorithm. This is the seam that lets each API key
 * choose Token Bucket or Sliding Window independently, and lets us add a
 * third algorithm later without touching gateway middleware.
 */
export class RateLimiterRegistry {
  private readonly tokenBucket: RateLimiter;
  private readonly slidingWindow: RateLimiter;

  constructor(redis: Redis) {
    this.tokenBucket = new RedisTokenBucketLimiter(redis);
    this.slidingWindow = new RedisSlidingWindowLimiter(redis);
  }

  async consume(
    clientId: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    if (config.algorithm === "token-bucket") {
      return this.tokenBucket.consume(clientId, config);
    }
    return this.slidingWindow.consume(clientId, config);
  }
}
