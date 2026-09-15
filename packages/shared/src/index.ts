// Types shared between the gateway (server) and dashboard (client).
// Keeping these in one place avoids the two apps' request/response shapes drifting apart.

export type Algorithm = "token-bucket" | "sliding-window";

export interface RateLimitConfig {
  algorithm: Algorithm;
  // Token Bucket fields
  burstCapacity?: number; // max tokens the bucket can hold
  refillRate?: number; // tokens added per second
  // Sliding Window fields
  limit?: number; // max requests allowed in the window
  windowSeconds?: number; // width of the rolling window
}

export interface ApiKeySummary {
  id: string;
  name: string;
  algorithm: Algorithm;
  config: RateLimitConfig;
  createdAt: string;
}

export interface ApiKeyCreatedResponse extends ApiKeySummary {
  // Only ever present in the create response — never retrievable again.
  plaintextKey: string;
}

export interface ApiKeyStats {
  id: string;
  name: string;
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  algorithm: Algorithm;
  config: RateLimitConfig;
}

export interface MetricsSnapshot {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  requestsPerSecond: number;
  allowedPercentage: number;
  blockedPercentage: number;
  perClient: ApiKeyStats[];
  timestamp: string;
}

export interface RateLimitErrorBody {
  error: "rate_limit_exceeded";
  message: string;
  retryAfter: number;
}
