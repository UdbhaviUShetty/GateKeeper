import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { createTestRedis, flushTestRedis } from "./setup";
import { env } from "../src/config/env";

const redis = createTestRedis();
const app = createApp(redis);

beforeEach(async () => {
  await flushTestRedis(redis);
});

afterAll(async () => {
  await redis.quit();
});

const adminHeaders = { "X-Admin-Key": env.adminApiKey };

describe("Admin API", () => {
  it("rejects requests without the admin key", async () => {
    const res = await request(app).get("/admin/api-keys");
    expect(res.status).toBe(403);
  });

  it("rejects a wrong-length admin key (constant-time comparison edge case)", async () => {
    const res = await request(app).get("/admin/api-keys").set("X-Admin-Key", "short");
    expect(res.status).toBe(403);
  });

  it("rejects a same-length but incorrect admin key", async () => {
    const wrongKey = "x".repeat(env.adminApiKey.length);
    const res = await request(app).get("/admin/api-keys").set("X-Admin-Key", wrongKey);
    expect(res.status).toBe(403);
  });

  it("creates an API key and returns the plaintext key exactly once", async () => {
    const res = await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "test-client", config: { algorithm: "token-bucket", burstCapacity: 5, refillRate: 1 } });

    expect(res.status).toBe(201);
    expect(res.body.plaintextKey).toMatch(/^gk_/);
    expect(res.body.name).toBe("test-client");
  });

  it("rejects invalid config shapes", async () => {
    const res = await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "bad-client", config: { algorithm: "token-bucket" } }); // missing fields

    expect(res.status).toBe(400);
  });

  it("rejects a zero or negative refillRate (would divide by zero in the Lua script)", async () => {
    const res = await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "bad-refill", config: { algorithm: "token-bucket", burstCapacity: 10, refillRate: 0 } });

    expect(res.status).toBe(400);
  });

  it("rejects a negative burstCapacity", async () => {
    const res = await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "bad-capacity", config: { algorithm: "token-bucket", burstCapacity: -5, refillRate: 2 } });

    expect(res.status).toBe(400);
  });

  it("rejects a zero windowSeconds for sliding-window", async () => {
    const res = await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "bad-window", config: { algorithm: "sliding-window", limit: 10, windowSeconds: 0 } });

    expect(res.status).toBe(400);
  });

  it("lists created keys without exposing hashes or plaintext", async () => {
    await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "list-me", config: { algorithm: "sliding-window", limit: 10, windowSeconds: 60 } });

    const res = await request(app).get("/admin/api-keys").set(adminHeaders);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe("list-me");
    expect(res.body[0]).not.toHaveProperty("keyHash");
    expect(res.body[0]).not.toHaveProperty("plaintextKey");
  });

  it("updates a key's rate limit config via PATCH", async () => {
    const create = await request(app)
      .post("/admin/api-keys")
      .set(adminHeaders)
      .send({ name: "patch-me", config: { algorithm: "token-bucket", burstCapacity: 5, refillRate: 1 } });

    const patch = await request(app)
      .patch(`/admin/api-keys/${create.body.id}/limits`)
      .set(adminHeaders)
      .send({ config: { algorithm: "token-bucket", burstCapacity: 99, refillRate: 9 } });

    expect(patch.status).toBe(200);
    expect(patch.body.config.burstCapacity).toBe(99);
  });

  it("returns 404 for a nonexistent key", async () => {
    const res = await request(app).get("/admin/api-keys/does-not-exist").set(adminHeaders);
    expect(res.status).toBe(404);
  });
});
