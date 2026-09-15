import { useEffect, useState, useRef } from "react";
import { fetchOverview, fetchClientStats, MetricsOverview, ClientStats } from "./api";
import { Overview } from "./components/Overview";
import { TrafficChart, TrafficPoint } from "./components/TrafficChart";
import { ClientTable } from "./components/ClientTable";
import { BurstTest } from "./components/BurstTest";

const POLL_INTERVAL_MS = 2000;
const MAX_CHART_POINTS = 30;

/**
 * LIVE DATA VIA POLLING, NOT WEBSOCKETS: a rate-limit dashboard's numbers
 * change at most once per request; a 2-second poll is imperceptibly
 * different from a push-based feed for a human watching the screen, and
 * it avoids an entire class of complexity (connection lifecycle, reconnect
 * logic, server-side pub/sub) that wouldn't teach anything new about
 * rate limiting — the actual subject of this project.
 */
export default function App() {
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [clients, setClients] = useState<ClientStats[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<TrafficPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const [overviewData, clientData] = await Promise.all([fetchOverview(), fetchClientStats()]);
        setOverview(overviewData);
        setClients(clientData);
        setError(null);

        setTrafficHistory((prev) => {
          const next = [
            ...prev,
            {
              time: new Date(overviewData.timestamp).toLocaleTimeString(),
              requestsPerSecond: overviewData.requestsPerSecond,
            },
          ];
          return next.slice(-MAX_CHART_POINTS);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reach the gateway");
      }
    }

    poll();
    intervalRef.current = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--amber)" }}>▮▮</span> GateKeeper
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 13 }}>
            Rate-limited API gateway — live traffic
          </p>
        </div>
        {error && (
          <span className="mono" style={{ color: "var(--blocked)", fontSize: 12 }}>
            ⚠ {error}
          </span>
        )}
      </header>

      <div className="grid" style={{ gap: 20 }}>
        <Overview data={overview} />
        <TrafficChart points={trafficHistory} />
        <ClientTable clients={clients} />
        <BurstTest />
      </div>
    </div>
  );
}
