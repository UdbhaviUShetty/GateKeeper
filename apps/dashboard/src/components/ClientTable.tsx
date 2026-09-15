import { ClientStats } from "../api";

function describeConfig(c: Record<string, unknown>): string {
  if (c.algorithm === "token-bucket") {
    return `${c.burstCapacity} cap · ${c.refillRate}/s refill`;
  }
  return `${c.limit} req / ${c.windowSeconds}s`;
}

export function ClientTable({ clients }: { clients: ClientStats[] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <h3 style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "20px 20px 12px" }}>
        Clients
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
            {["Client", "Algorithm", "Limit", "Requests", "Allowed", "Blocked"].map((h) => (
              <th key={h} style={{ padding: "8px 20px", color: "var(--text-dim)", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="mono">
          {clients.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 20, color: "var(--text-dim)" }}>No clients yet — create one via the admin API.</td></tr>
          )}
          {clients.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "10px 20px" }}>{c.name}</td>
              <td style={{ padding: "10px 20px", color: "var(--text-dim)" }}>{c.algorithm}</td>
              <td style={{ padding: "10px 20px", color: "var(--text-dim)" }}>{describeConfig(c.config)}</td>
              <td style={{ padding: "10px 20px" }}>{c.totalRequests}</td>
              <td style={{ padding: "10px 20px", color: "var(--allowed)" }}>{c.allowedRequests}</td>
              <td style={{ padding: "10px 20px", color: "var(--blocked)" }}>{c.blockedRequests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
