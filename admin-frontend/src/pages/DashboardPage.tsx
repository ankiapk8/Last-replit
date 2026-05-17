import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";

interface HealthData {
  status: string;
  configs: {
    providers: number;
    modes: number;
    tools: number;
    routing: number;
    mcp: number;
  };
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/admin/health`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => setHealth(d.data))
      .catch(() => setError("Failed to fetch health status"));
  }, [token]);

  const stats = [
    { label: "AI Providers", value: health?.configs.providers ?? "—", color: "var(--info)" },
    { label: "Agent Modes", value: health?.configs.modes ?? "—", color: "var(--accent)" },
    { label: "Tools", value: health?.configs.tools ?? "—", color: "var(--success)" },
    { label: "Routing Rules", value: health?.configs.routing ?? "—", color: "var(--warning)" },
    { label: "MCP Servers", value: health?.configs.mcp ?? "—", color: "var(--danger)" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        System overview and health status
      </p>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>System Status</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={health?.status === "healthy" ? "badge badge-success" : "badge badge-warning"}
          >
            {health?.status ?? "loading..."}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            {health ? "All systems operational" : "Checking..."}
          </span>
        </div>
      </div>
    </div>
  );
}
