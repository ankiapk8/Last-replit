import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";
interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  manual_pro: boolean;
  created_at: string;
}
export default function UsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    fetch(`${API_BASE}/api/admin/users?${params}`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users || []);
        setTotal(d.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, page, search]);

  const totalPages = Math.ceil(total / limit);
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Users</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        Manage user accounts ({total} total)
      </p>
      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ maxWidth: 400 }}
        />
      </div>
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Pro</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.email}</td>
                  <td>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td>
                    <span
                      className={`badge ${u.role === "admin" ? "badge-danger" : u.role === "moderator" ? "badge-warning" : "badge-info"}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td>
                    {u.manual_pro ? (
                      <span className="badge badge-success">Yes</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>No</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {new Date(u.created_at).toLocaleDateString()}
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
