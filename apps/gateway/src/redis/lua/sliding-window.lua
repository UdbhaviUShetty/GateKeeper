-- Sliding Window Log, evaluated atomically inside Redis using a sorted set.
--
-- WHY A SORTED SET: we need to store individual request timestamps and
-- efficiently (a) drop timestamps older than the window and (b) count what's
-- left. A Redis sorted set (ZSET), scored by timestamp, gives us both in
-- logarithmic time: ZREMRANGEBYSCORE to evict old entries, ZCARD to count.
--
-- WHY THIS MUST BE ONE SCRIPT: doing ZREMRANGEBYSCORE, ZCARD, and ZADD as
-- three separate round trips has the same race condition class as Token
-- Bucket's GET/SET problem — two concurrent requests could both ZCARD and
-- see "9 of 10 used", both decide they're allowed, and both ZADD, putting
-- the client over their limit.

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])
local member = ARGV[3] -- unique per-request identifier (timestamp + random suffix)
local ttlSeconds = tonumber(ARGV[4])

local time = redis.call("TIME")
local nowMs = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local windowStartMs = nowMs - (windowSeconds * 1000)

-- Evict anything outside the rolling window before counting.
redis.call("ZREMRANGEBYSCORE", key, "-inf", windowStartMs)

local count = redis.call("ZCARD", key)

local allowed
local retryAfter = 0

if count < limit then
  allowed = 1
  redis.call("ZADD", key, nowMs, member)
else
  allowed = 0
  -- Retry-After: time until the oldest request in the window falls out of it.
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  if oldest[2] then
    local oldestMs = tonumber(oldest[2])
    local msUntilExpiry = (oldestMs + (windowSeconds * 1000)) - nowMs
    retryAfter = math.max(1, math.ceil(msUntilExpiry / 1000))
  else
    retryAfter = windowSeconds
  end
end

redis.call("EXPIRE", key, ttlSeconds)

local remaining = math.max(0, limit - redis.call("ZCARD", key))
local resetAtSeconds = math.floor(nowMs / 1000) + windowSeconds

return {allowed, tostring(remaining), tostring(retryAfter), tostring(resetAtSeconds)}
