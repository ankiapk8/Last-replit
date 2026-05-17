import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";

interface Provider {
  id: string;
  provider: string;
  base_url: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ProvidersPage() {
  const { token } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ provider: "", api_key: "", base_url: "", is_active: true });

  const fetchProviders = () => {
    fetch(`${API_BASE}/admin/providers`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.data || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load providers");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProviders();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/providers`, {
        method: "POST",
        headers: authHeaders(token!),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create");
      setShowForm(false);
      setForm({ provider: "", api_key: "", base_url: "", is_active: true });
      fetchProviders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create provider");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this provider?")) return;
    try {
      await fetch(`${API_BASE}/admin/providers/${id}`, {
        method: "DELETE",
        headers: authHeaders(token!),
      });
      fetchProviders();
    } catch {
      setError("Failed to delete");
    }
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
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>AI Providers</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage AI provider configurations</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Add Provider"}
        </button>
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>New Provider</h3>
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}
                >
                  Provider Name
                </label>
                <input
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  required
                  placeholder="e.g. openrouter"
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}
                >
                  Base URL (optional)
                </label>
                <input
                  value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                API Key
              </label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                required
                placeholder="sk-..."
              />
            </div>
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span style={{ fontSize: 14 }}>Active</span>
              </label>
            </div>
            <button type="submit" className="btn-primary" style={{ width: "fit-content" }}>
              Create Provider
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : providers.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}
        >
          No providers configured
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Base URL</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.provider}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {p.base_url || "—"}
                  </td>
                  <td>
                    <span className={p.is_active ? "badge badge-success" : "badge badge-danger"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      style={{ padding: "4px 12px", fontSize: 13 }}
                      onClick={() => handleDelete(p.id)}
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
