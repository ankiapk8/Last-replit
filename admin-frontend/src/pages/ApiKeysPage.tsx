import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";
interface ApiKey {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}
export default function ApiKeysPage() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: "admin" as const });
  const [newKey, setNewKey] = useState<string | null>(null);

  const fetchKeys = () => {
    fetch(`${API_BASE}/admin/api-keys`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setKeys(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(() => {
    fetchKeys();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/admin/api-keys`, {
      method: "POST",
      headers: authHeaders(token!),
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const d = await res.json();
      setNewKey(d.data.key);
    }
    setShowForm(false);
    fetchKeys();
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Revoke this API key?")) return;
    await fetch(`${API_BASE}/admin/api-keys/${id}`, {
      method: "DELETE",
      headers: authHeaders(token!),
    });
    fetchKeys();
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
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>API Keys</h1>
          <p style={{ color: "var(--text-secondary)" }}>Manage admin API keys</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Create Key"}
        </button>
      </div>
      {newKey && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--success)" }}>
            API Key Created — Copy it now!
          </div>
          <code
            style={{
              background: "var(--bg-tertiary)",
              padding: "8px 12px",
              borderRadius: 4,
              display: "block",
              wordBreak: "break-all",
              fontSize: 13,
            }}
          >
            {newKey}
          </code>
          <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setNewKey(null)}>
            Dismiss
          </button>
        </div>
      )}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <form
            onSubmit={handleCreate}
            style={{ display: "flex", gap: 16, alignItems: "flex-end" }}
          >
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. CI/CD"
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
                Role
              </label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "admin" })}
              >
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
                <option value="developer">Developer</option>
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Create
            </button>
          </form>
        </div>
      )}
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
                <th>Role</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.name}</td>
                  <td>
                    <span className="badge badge-info">{k.role}</span>
                  </td>
                  <td>
                    <span className={k.is_active ? "badge badge-success" : "badge badge-danger"}>
                      {k.is_active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="btn-danger"
                      style={{ padding: "4px 12px", fontSize: 13 }}
                      onClick={() => handleDelete(k.id)}
                    >
                      Revoke
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
