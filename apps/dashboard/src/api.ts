// Every fetch here goes through the gateway's own HTTP API — the dashboard
// never touches Redis directly. This matters architecturally: the dashboard
// is just another client of GateKeeper's public surface, the same surface
// any other consumer would use. It also means the dashboard can be deployed
// completely separately from the gateway/Redis.
//
// BASE URL: in local dev (`npm run dev`), relative paths work because
// vite.config.ts proxies /admin, /metrics, /api to the gateway. In the
// Docker build, there's no dev-server proxy, so we need an absolute URL —
// set at build time via VITE_GATEWAY_URL (see docker-compose.yml). The
// browser (not the dashboard container) is what makes these requests, so
// this must be a URL reachable from the host machine, not a Docker service
// name like "http://gateway:3000".
const BASE_URL = import.meta.env.VITE_GATEWAY_URL ?? "";

export interface MetricsOverview {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  requestsPerSecond: number;
  allowedPercentage: number;
  blockedPercentage: number;
  timestamp: string;
}

export interface ClientStats {
  id: string;
  name: string;
  algorithm: "token-bucket" | "sliding-window";
  config: Record<string, unknown>;
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  algorithm: "token-bucket" | "sliding-window";
  config: Record<string, unknown>;
  createdAt: string;
}

export async function fetchOverview(): Promise<MetricsOverview> {
  const res = await fetch(`${BASE_URL}/metrics/overview`);
  if (!res.ok) throw new Error(`metrics/overview failed: ${res.status}`);
  return res.json();
}

export async function fetchClientStats(): Promise<ClientStats[]> {
  const res = await fetch(`${BASE_URL}/metrics/clients`);
  if (!res.ok) throw new Error(`metrics/clients failed: ${res.status}`);
  return res.json();
}

export async function fetchApiKeys(adminKey: string): Promise<ApiKeySummary[]> {
  const res = await fetch(`${BASE_URL}/admin/api-keys`, { headers: { "X-Admin-Key": adminKey } });
  if (!res.ok) throw new Error(`admin/api-keys failed: ${res.status}`);
  return res.json();
}

export interface BurstResult {
  index: number;
  status: number;
  allowed: boolean;
  latencyMs: number;
}

/**
 * Fires `count` requests at /api/hello as fast as the browser will send
 * them, using the given API key. This is what powers the "Run Burst Test"
 * button — it's making real HTTP calls through the real gateway, not
 * simulating anything client-side.
 */
export async function runBurstTest(
  apiKey: string,
  count: number,
  onResult: (result: BurstResult) => void
): Promise<void> {
  const requests = Array.from({ length: count }, (_, i) => i);

  await Promise.all(
    requests.map(async (index) => {
      const startedAt = performance.now();
      try {
        const res = await fetch(`${BASE_URL}/api/hello`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        onResult({
          index,
          status: res.status,
          allowed: res.status !== 429,
          latencyMs: Math.round(performance.now() - startedAt),
        });
      } catch {
        onResult({ index, status: 0, allowed: false, latencyMs: Math.round(performance.now() - startedAt) });
      }
    })
  );
}
