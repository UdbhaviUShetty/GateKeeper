import { Redis } from "ioredis";
import { randomUUID } from "crypto";
import { hashApiKey, generateApiKey } from "../utils/hash";
import { RateLimitConfig } from "../types/rate-limit";

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  config: RateLimitConfig;
  createdAt: string;
}

export interface ApiKeyCreateInput {
  name: string;
  config: RateLimitConfig;
}

const INDEX_SET = "apikeys:index"; // Redis SET of all api key ids
const recordKey = (id: string) => `apikey:${id}`;
const hashLookupKey = (keyHash: string) => `apikey_by_hash:${keyHash}`;

/**
 * Stores API key metadata in Redis (not just in-memory) so that, like rate
 * limit state, it's shared across every gateway instance — any instance can
 * authenticate any key without needing its own local copy.
 *
 * This is intentionally simple for the portfolio scope: no pagination, no
 * caching layer in front of Redis. At real scale you'd likely cache hot
 * lookups (see README "Hot API keys" / scaling section).
 */
export class ApiKeyService {
  constructor(private readonly redis: Redis) {}

  async create(input: ApiKeyCreateInput): Promise<{ record: ApiKeyRecord; plaintextKey: string }> {
    const id = randomUUID();
    const plaintextKey = generateApiKey();
    const keyHash = hashApiKey(plaintextKey);

    const record: ApiKeyRecord = {
      id,
      name: input.name,
      keyHash,
      config: input.config,
      createdAt: new Date().toISOString(),
    };

    await this.redis
      .multi()
      .hset(recordKey(id), this.serialize(record))
      .sadd(INDEX_SET, id)
      .set(hashLookupKey(keyHash), id)
      .exec();

    return { record, plaintextKey };
  }

  async list(): Promise<ApiKeyRecord[]> {
    const ids = await this.redis.smembers(INDEX_SET);
    const records = await Promise.all(ids.map((id) => this.getById(id)));
    return records.filter((r): r is ApiKeyRecord => r !== null);
  }

  async getById(id: string): Promise<ApiKeyRecord | null> {
    const data = await this.redis.hgetall(recordKey(id));
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserialize(data);
  }

  async findByRawKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const keyHash = hashApiKey(rawKey);
    const id = await this.redis.get(hashLookupKey(keyHash));
    if (!id) return null;
    return this.getById(id);
  }

  async updateLimits(id: string, config: RateLimitConfig): Promise<ApiKeyRecord | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const updated: ApiKeyRecord = { ...existing, config };
    await this.redis.hset(recordKey(id), this.serialize(updated));
    return updated;
  }

  private serialize(record: ApiKeyRecord): Record<string, string> {
    return {
      id: record.id,
      name: record.name,
      keyHash: record.keyHash,
      config: JSON.stringify(record.config),
      createdAt: record.createdAt,
    };
  }

  private deserialize(data: Record<string, string>): ApiKeyRecord {
    return {
      id: data.id,
      name: data.name,
      keyHash: data.keyHash,
      config: JSON.parse(data.config) as RateLimitConfig,
      createdAt: data.createdAt,
    };
  }
}

/**
 * Seeds two demo clients on startup so the gateway is usable immediately
 * without first calling the admin API — mirrors the project spec's
 * "demo-client" (Token Bucket) and "strict-client" (Sliding Window)
 * examples. Idempotent: skips seeding if keys already exist.
 */
export async function seedDemoApiKeys(
  service: ApiKeyService,
  redis: Redis
): Promise<{ demoKey: string; strictKey: string } | null> {
  const seededMarker = "apikeys:seeded";
  const alreadySeeded = await redis.get(seededMarker);
  if (alreadySeeded) return null;

  const demo = await service.create({
    name: "demo-client",
    config: { algorithm: "token-bucket", burstCapacity: 10, refillRate: 2 },
  });

  const strict = await service.create({
    name: "strict-client",
    config: { algorithm: "sliding-window", limit: 10, windowSeconds: 60 },
  });

  await redis.set(seededMarker, "1");

  return { demoKey: demo.plaintextKey, strictKey: strict.plaintextKey };
}
