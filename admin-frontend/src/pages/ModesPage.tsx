import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";

interface Mode {
  id: string;
  name: string;
  description: string | null;
  model: string;
  provider: string;
  is_active: boolean;
}

export default function ModesPage() {
  const { token } = useAuth();
  const [modes, setModes] = useState<Mode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchModes = () => {
    fetch(`${API_BASE}/admin/modes`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setModes(d.data || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load modes");
        setLoading(false);
      });
  };
  useEffect(() => {
    fetchModes();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this mode?")) return;
    await fetch(`${API_BASE}/admin/modes/${id}`, {
      method: "DELETE",
      headers: authHeaders(token!),
    });
    fetchModes();
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Agent Modes</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage agent mode configurations</p>
        </div>
      </div>
      {error && <div style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : modes.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}
        >
          No modes configured
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {modes.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {m.description || "—"}
                  </td>
                  <td style={{ fontSize: 13, fontFamily: "monospace" }}>{m.model}</td>
                  <td>{m.provider}</td>
                  <td>
                    <span className={m.is_active ? "badge badge-success" : "badge badge-danger"}>
                      {m.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      style={{ padding: "4px 12px", fontSize: 13 }}
                      onClick={() => handleDelete(m.id)}
                    >
                      Delete
                    </button>
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
