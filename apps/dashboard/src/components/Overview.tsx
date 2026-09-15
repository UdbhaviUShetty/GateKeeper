import { MetricsOverview } from "../api";

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 28, fontWeight: 600, color: accent ?? "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

export function Overview({ data }: { data: MetricsOverview | null }) {
  if (!data) {
    return <div className="card mono" style={{ color: "var(--text-dim)" }}>Loading metrics…</div>;
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      <StatCard label="Total requests" value={data.totalRequests.toLocaleString()} />
      <StatCard label="Requests/sec" value={data.requestsPerSecond.toFixed(1)} accent="var(--amber)" />
      <StatCard label="Allowed" value={data.allowedRequests.toLocaleString()} accent="var(--allowed)" />
      <StatCard label="Blocked" value={data.blockedRequests.toLocaleString()} accent="var(--blocked)" />
      <StatCard label="Allowed %" value={`${data.allowedPercentage}%`} accent="var(--allowed)" />
      <StatCard label="Blocked %" value={`${data.blockedPercentage}%`} accent="var(--blocked)" />
    </div>
  );
}
