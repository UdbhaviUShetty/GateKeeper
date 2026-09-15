import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

export interface TrafficPoint {
  time: string;
  requestsPerSecond: number;
}

/**
 * Requests/sec over time, sampled from repeated polls of /metrics/overview.
 * We keep only the last N samples client-side (a simple ring buffer) —
 * there's no historical time-series storage on the gateway; this is a live
 * view, not a dashboard with query-able history. That's a deliberate scope
 * cut for a portfolio project (see README "Known limitations").
 */
export function TrafficChart({ points }: { points: TrafficPoint[] }) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
        Requests/sec
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={points}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="time" stroke="var(--text-faint)" fontSize={11} tickLine={false} />
          <YAxis stroke="var(--text-faint)" fontSize={11} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "var(--text-dim)" }}
          />
          <Line type="monotone" dataKey="requestsPerSecond" stroke="var(--amber)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
