import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";
interface AuditEntry {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource: string;
  resource_id: string | null;
  ip_address: string | null;
  created_at: string;
}
export default function AuditPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetch(`${API_BASE}/admin/audit?page=${page}&limit=${limit}`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.data || []);
        setTotal(d.meta?.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, page]);

  const totalPages = Math.ceil(total / limit);
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Audit Log</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        Admin action history ({total} entries)
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
                <th>Time</th>
                <th>Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Resource</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {e.actor_id.slice(0, 12)}...
                  </td>
                  <td>
                    <span className="badge badge-info">{e.actor_role}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${e.action === "delete" ? "badge-danger" : e.action === "create" ? "badge-success" : "badge-warning"}`}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td>
                    {e.resource}
                    {e.resource_id ? `:${e.resource_id.slice(0, 8)}` : ""}
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {e.ip_address || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button
                className="btn-ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span style={{ color: "var(--text-secondary)", alignSelf: "center" }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn-ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
