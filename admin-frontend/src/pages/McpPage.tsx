import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";
interface McpServer {
  id: string;
  name: string;
  transport: string;
  url: string | null;
  is_enabled: boolean;
}
export default function McpPage() {
  const { token } = useAuth();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE}/admin/mcp`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setServers(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>MCP Servers</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        Manage MCP server configurations
      </p>
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Transport</th>
                <th>URL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>
                    <span className="badge badge-info">{s.transport}</span>
                  </td>
                  <td style={{ fontSize: 13, fontFamily: "monospace" }}>{s.url || "—"}</td>
                  <td>
                    <span className={s.is_enabled ? "badge badge-success" : "badge badge-danger"}>
                      {s.is_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
