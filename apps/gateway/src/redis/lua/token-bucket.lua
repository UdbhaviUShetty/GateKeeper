-- Token Bucket, evaluated atomically inside Redis.
--
-- WHY LUA: Redis executes a single Lua script as one atomic operation — no
-- other client's command can interleave between our GET and our SET. That's
-- what prevents the race condition where two concurrent gateway instances
-- both read "1 token available" and both allow a request that should have
-- been rejected.
--
-- WHY REDIS TIME INSTEAD OF A CLIENT-SUPPLIED TIMESTAMP: if each gateway
-- instance used its own Node.js clock, and those clocks drift even slightly
-- (which real servers' clocks do), refill calculations become inconsistent
-- depending on which instance handled the request. Redis TIME gives every
-- instance the same clock, so the "elapsed time" calculation is consistent
-- no matter which gateway node is serving the request.

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])   -- tokens per second
local ttlSeconds = tonumber(ARGV[3])

local time = redis.call("TIME")
-- TIME returns {seconds, microseconds} as strings; combine into ms.
local nowMs = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)

local data = redis.call("HMGET", key, "tokens", "lastRefillMs")
local tokens
local lastRefillMs

if data[1] == false then
  -- No prior state: new client starts with a full bucket.
  tokens = capacity
  lastRefillMs = nowMs
else
  tokens = tonumber(data[1])
  lastRefillMs = tonumber(data[2])
end

local elapsedSeconds = math.max(0, (nowMs - lastRefillMs) / 1000)
tokens = math.min(capacity, tokens + (elapsedSeconds * refillRate))

local allowed
local retryAfter = 0

if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
else
  allowed = 0
  local deficit = 1 - tokens
  retryAfter = math.ceil(deficit / refillRate)
end

redis.call("HMSET", key, "tokens", tokens, "lastRefillMs", nowMs)
-- TTL prevents Redis from accumulating rate-limit state forever for clients
-- that stop sending traffic. We set it generously above the time it would
-- take to fully refill from empty, so an active client's key never expires
-- mid-use, but an abandoned client's key eventually disappears.
redis.call("EXPIRE", key, ttlSeconds)

-- Reset time: when the bucket would next reach full capacity (informational
-- for the X-RateLimit-Reset header; Token Bucket doesn't have a hard window
-- boundary the way Sliding Window does).
local secondsToFull = (capacity - tokens) / refillRate
local resetAtSeconds = math.floor(nowMs / 1000) + math.ceil(secondsToFull)

return {allowed, tostring(tokens), tostring(retryAfter), tostring(resetAtSeconds)}
