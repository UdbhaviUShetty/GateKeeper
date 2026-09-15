import { useState } from "react";
import { runBurstTest, BurstResult } from "../api";

/**
 * The signature interaction of this dashboard: fire a configurable burst of
 * real requests through the real gateway and watch each one light up green
 * (allowed) or red (blocked) in sequence — a literal visualization of a gate
 * letting traffic through until the limit closes it. This is the moment
 * that makes rate limiting *visible* rather than abstract, which is the
 * whole point of demoing this project in an interview.
 */
export function BurstTest() {
  const [apiKey, setApiKey] = useState("");
  const [count, setCount] = useState(25);
  const [results, setResults] = useState<BurstResult[]>([]);
  const [running, setRunning] = useState(false);

  const allowedCount = results.filter((r) => r.allowed).length;
  const blockedCount = results.filter((r) => !r.allowed).length;
  const avgLatency = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length)
    : 0;

  async function handleRun() {
    if (!apiKey.trim()) return;
    setResults([]);
    setRunning(true);
    const collected: BurstResult[] = [];
    await runBurstTest(apiKey.trim(), count, (result) => {
      collected.push(result);
      // Sort by index as results stream in so the light strip renders
      // left-to-right in request order, even though requests complete
      // out of order under real concurrency.
      setResults([...collected].sort((a, b) => a.index - b.index));
    });
    setRunning(false);
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
        Burst test
      </h3>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          type="text"
          placeholder="API key (gk_...)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="mono"
          style={{
            flex: "1 1 220px",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "8px 10px",
            color: "var(--text)",
            fontSize: 13,
          }}
        />
        <input
          type="number"
          min={1}
          max={200}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="mono"
          style={{
            width: 80,
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "8px 10px",
            color: "var(--text)",
            fontSize: 13,
          }}
        />
        <button
          onClick={handleRun}
          disabled={running || !apiKey.trim()}
          style={{
            background: running ? "var(--amber-dim)" : "var(--amber)",
            color: "#1a1200",
            border: "none",
            borderRadius: 4,
            padding: "8px 18px",
            fontWeight: 600,
            fontSize: 13,
            opacity: !apiKey.trim() ? 0.5 : 1,
          }}
        >
          {running ? "Running…" : "Run burst test"}
        </button>
      </div>

      {results.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: 14,
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              marginBottom: 12,
            }}
          >
            {results.map((r) => (
              <div
                key={r.index}
                title={`Request ${r.index + 1}: HTTP ${r.status} (${r.latencyMs}ms)`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: r.allowed ? "var(--allowed)" : "var(--blocked)",
                  boxShadow: r.allowed ? "0 0 6px var(--allowed)" : "0 0 6px var(--blocked)",
                }}
              />
            ))}
          </div>

          <div className="mono" style={{ display: "flex", gap: 24, fontSize: 13 }}>
            <span style={{ color: "var(--allowed)" }}>{allowedCount} allowed</span>
            <span style={{ color: "var(--blocked)" }}>{blockedCount} blocked</span>
            <span style={{ color: "var(--text-dim)" }}>{avgLatency}ms avg latency</span>
          </div>
        </>
      )}
    </div>
  );
}
