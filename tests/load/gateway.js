import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

/**
 * GateKeeper load test.
 *
 * WHAT THIS MEASURES: throughput and latency of the full gateway pipeline
 * (auth -> rate limit -> proxy) under different traffic shapes, against
 * both algorithms. It does NOT measure Redis or the backend in isolation —
 * that's intentional, since what matters for the resume/interview story is
 * "how does the gateway behave as a whole," not micro-benchmarking Redis.
 *
 * SETUP REQUIRED BEFORE RUNNING:
 *   1. `docker compose up -d` (or run gateway + backend + redis locally)
 *   2. Create at least one Token Bucket and one Sliding Window API key via
 *      the admin API (or use the auto-seeded demo-client / strict-client
 *      keys logged on gateway startup) and set them below via environment
 *      variables so this script doesn't hardcode secrets:
 *
 *        TOKEN_BUCKET_KEY=gk_... SLIDING_WINDOW_KEY=gk_... k6 run tests/load/gateway.js
 *
 * DO NOT report numbers from this script unless you actually ran it — see
 * the README's "Benchmark Results" section for where to record real output.
 */

const BASE_URL = __ENV.GATEWAY_URL || "http://localhost:3000";
const TOKEN_BUCKET_KEY = __ENV.TOKEN_BUCKET_KEY || "";
const SLIDING_WINDOW_KEY = __ENV.SLIDING_WINDOW_KEY || "";

const rateLimited = new Counter("rate_limited_responses");
const rateLimitedRate = new Rate("rate_limited_rate");
const successRate = new Rate("success_rate");

export const options = {
  scenarios: {
    // 1. Normal traffic: light, steady load on the Token Bucket client —
    // should see close to 0% blocked, since it stays under the refill rate.
    normal_traffic: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 5,
      exec: "tokenBucketRequest",
      startTime: "0s",
    },
    // 2. Burst traffic: a sudden spike well above burst capacity — expect
    // the first ~capacity requests to succeed, the rest to be blocked.
    burst_traffic: {
      executor: "shared-iterations",
      vus: 20,
      iterations: 40,
      maxDuration: "15s",
      exec: "tokenBucketRequest",
      startTime: "35s",
    },
    // 3. Sustained traffic: steady load above refill rate for a longer
    // period — demonstrates steady-state blocked % once tokens run dry.
    sustained_traffic: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 10,
      exec: "tokenBucketRequest",
      startTime: "55s",
    },
    // 4. Sliding Window traffic: exercises the second algorithm under
    // similar load so the two can be compared in the results.
    sliding_window_traffic: {
      executor: "constant-arrival-rate",
      rate: 3,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 10,
      exec: "slidingWindowRequest",
      startTime: "90s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],
  },
};

function makeRequest(apiKey) {
  const res = http.get(`${BASE_URL}/api/hello`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const isRateLimited = res.status === 429;
  rateLimitedRate.add(isRateLimited);
  successRate.add(res.status === 200);
  if (isRateLimited) rateLimited.add(1);

  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "has rate limit headers on 200": (r) => r.status !== 200 || r.headers["X-Ratelimit-Limit"] !== undefined,
    "has retry-after on 429": (r) => r.status !== 429 || r.headers["Retry-After"] !== undefined,
  });

  sleep(0.05);
}

export function tokenBucketRequest() {
  if (!TOKEN_BUCKET_KEY) {
    console.error("TOKEN_BUCKET_KEY not set — see this file's header comment for setup instructions.");
    return;
  }
  makeRequest(TOKEN_BUCKET_KEY);
}

export function slidingWindowRequest() {
  if (!SLIDING_WINDOW_KEY) {
    console.error("SLIDING_WINDOW_KEY not set — see this file's header comment for setup instructions.");
    return;
  }
  makeRequest(SLIDING_WINDOW_KEY);
}
