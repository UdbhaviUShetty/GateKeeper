import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(requireEnv("PORT", "3000"), 10),
  nodeEnv: requireEnv("NODE_ENV", "development"),
  redisUrl: requireEnv("REDIS_URL", "redis://localhost:6379"),
  backendUrl: requireEnv("BACKEND_URL", "http://localhost:4000"),
  // SECURITY: "dev-admin-key" is a fine default for local `npm run dev`,
  // but it's a value that could easily end up copy-pasted into a real
  // deployment if we let it silently apply there too. We only allow this
  // fallback outside production; in production, a missing ADMIN_API_KEY
  // fails startup loudly instead of failing open silently. This repo's
  // docker-compose.yml does NOT hardcode a value — it requires
  // ADMIN_API_KEY to come from a gitignored root .env file (see
  // .env.example), so this check doesn't affect the working Docker setup.
  adminApiKey:
    process.env.NODE_ENV === "production"
      ? requireEnv("ADMIN_API_KEY")
      : requireEnv("ADMIN_API_KEY", "dev-admin-key"),
};
