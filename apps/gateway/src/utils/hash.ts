import { createHash, randomBytes } from "crypto";

/**
 * We never store raw API keys — only a SHA-256 hash. If our database (Redis,
 * here) were ever leaked, the attacker gets hashes, not usable keys. This
 * mirrors how you'd never store plaintext passwords. The plaintext key is
 * shown to the user exactly once, at creation time, and never again.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): string {
  // Prefix makes keys recognizable in logs/config without revealing secrecy
  // (similar to how Stripe/GitHub prefix their keys, e.g. sk_live_...).
  return `gk_${randomBytes(24).toString("hex")}`;
}
