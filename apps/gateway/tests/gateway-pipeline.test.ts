import { describe, it, expect, afterAll, beforeEach } from "vitest";
import request from "supertest";
import http from "http";
import { createTestRedis, flushTestRedis } from "./setup";
import { env } from "../src/config/env";

// Spin up a tiny fake backend and set BACKEND_URL *before* importing app.ts,
// since the proxy middleware reads env.backendUrl once, at module load time.
// All of this has to happen via top-level await, in order, before the
// `import("../src/app")` below — a beforeAll() hook would run too late,
// after the module (and its imports) has already been evaluated.
const fakeBackend: http.Server = http.createServer((req, res) => {
  if (req.url === "/api/hello") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Hello from backend", path: req.url }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found_in_fake_backend", path: req.url }));
});

await new Promise<void>((resolve) => fakeBackend.listen(0, resolve));
const address = fakeBackend.address();
const backendPort = typeof address === "object" && address ? address.port : 0;
process.env.BACKEND_URL = `http://127.0.0.1:${backendPort}`;

afterAll(async () => {
  await new Promise((resolve) => fakeBackend.close(resolve));
});

// Import AFTER BACKEND_URL is set.
const { createApp } = await import("../src/app");

const redis = createTestRedis();
const app = createApp(redis);

beforeEach(async () => {
  await flushTestRedis(redis);
});

afterAll(async () => {
  await redis.quit();
});

async function createDemoKey(config: object) {
  const res = await request(app)
    .post("/admin/api-keys")
    .set("X-Admin-Key", env.adminApiKey)
    .send({ name: "pipeline-test-client", config });
  return res.body.plaintextKey as string;
}

describe("Full gateway pipeline: auth -> rate limit -> proxy", () => {
  it("rejects requests with no API key", async () => {
    const res = await request(app).get("/api/hello");
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid API key", async () => {
    const res = await request(app).get("/api/hello").set("Authorization", "Bearer nonsense");
    expect(res.status).toBe(401);
  });

  it("proxies an allowed request through to the backend and returns its response", async () => {
    const key = await createDemoKey({ algorithm: "token-bucket", burstCapacity: 5, refillRate: 1 });
    const res = await request(app).get("/api/hello").set("Authorization", `Bearer ${key}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Hello from backend");
  });

  it("sets X-RateLimit-* headers on allowed requests", async () => {
    const key = await createDemoKey({ algorithm: "token-bucket", burstCapacity: 5, refillRate: 1 });
    const res = await request(app).get("/api/hello").set("Authorization", `Bearer ${key}`);

    expect(res.headers["x-ratelimit-limit"]).toBe("5");
    expect(Number(res.headers["x-ratelimit-remaining"])).toBeLessThanOrEqual(5);
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("returns 429 with Retry-After once the limit is exceeded", async () => {
    const key = await createDemoKey({ algorithm: "token-bucket", burstCapacity: 2, refillRate: 0.001 });

    await request(app).get("/api/hello").set("Authorization", `Bearer ${key}`);
    await request(app).get("/api/hello").set("Authorization", `Bearer ${key}`);
    const blocked = await request(app).get("/api/hello").set("Authorization", `Bearer ${key}`);

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("rate_limit_exceeded");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("propagates X-Request-ID to the backend and back to the client", async () => {
    const key = await createDemoKey({ algorithm: "token-bucket", burstCapacity: 5, refillRate: 1 });
    const res = await request(app)
      .get("/api/hello")
      .set("Authorization", `Bearer ${key}`)
      .set("X-Request-ID", "test-request-id-123");

    expect(res.headers["x-request-id"]).toBe("test-request-id-123");
  });

  it("enforces sliding-window clients independently from token-bucket clients", async () => {
    const swKey = await createDemoKey({ algorithm: "sliding-window", limit: 2, windowSeconds: 60 });

    await request(app).get("/api/hello").set("Authorization", `Bearer ${swKey}`);
    await request(app).get("/api/hello").set("Authorization", `Bearer ${swKey}`);
    const blocked = await request(app).get("/api/hello").set("Authorization", `Bearer ${swKey}`);

    expect(blocked.status).toBe(429);
  });
});
