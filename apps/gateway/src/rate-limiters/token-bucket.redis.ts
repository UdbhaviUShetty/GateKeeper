import { Redis } from "ioredis";
import {
  RateLimiter,
  RateLimitResult,
  TokenBucketConfig,
} from "../types/rate-limit";

// TTL: generous upper bound on "how long could this client be idle before we
// stop caring about their exact fractional token count". We use 2x the time
// it would take to refill from empty to full — well past that, the bucket
// is full again anyway, so losing the key changes nothing observable.
function computeTtlSeconds(config: TokenBucketConfig): number {
  const secondsToFull = config.burstCapacity / config.refillRate;
  return Math.max(60, Math.ceil(secondsToFull * 2));
}

export class RedisTokenBucketLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(
    clientId: string,
    config: TokenBucketConfig
  ): Promise<RateLimitResult> {
    const key = `rate_limit:token_bucket:${clientId}`;
    const ttl = computeTtlSeconds(config);

    // Single round trip: the Lua script does GET + calculate + SET
    // atomically server-side. See src/redis/lua/token-bucket.lua for why
    // this has to be one script rather than separate commands.
    const [allowed, remainingStr, retryAfterStr, resetAtStr] =
      await this.redis.tokenBucket(
        key,
        config.burstCapacity,
        config.refillRate,
        ttl
      );

    const remaining = Math.floor(Number(remainingStr));
    const retryAfterSeconds = Number(retryAfterStr);
    const resetAt = Number(resetAtStr);

    return {
      allowed: allowed === 1,
      remaining,
      limit: config.burstCapacity,
      resetAt,
      retryAfterSeconds: allowed === 1 ? undefined : retryAfterSeconds,
    };
  }
}
