import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";
interface Tool {
  id: string;
  name: string;
  description: string;
  category: string;
  is_enabled: boolean;
}
export default function ToolsPage() {
  const { token } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE}/admin/tools`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setTools(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Tools</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        Manage agent tool configurations
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
                <th>Description</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{t.description}</td>
                  <td>
                    <span className="badge badge-info">{t.category}</span>
                  </td>
                  <td>
                    <span className={t.is_enabled ? "badge badge-success" : "badge badge-danger"}>
                      {t.is_enabled ? "Enabled" : "Disabled"}
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
