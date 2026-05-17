import { useState, useEffect } from "react";
import { useAuth, authHeaders, API_BASE } from "../context/AuthContext";
interface Feedback {
  id: string;
  user_id: string;
  type: string;
  message: string;
  rating: number | null;
  created_at: string;
}
export default function FeedbackPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API_BASE}/api/feedback`, { headers: authHeaders(token!) })
      .then((r) => r.json())
      .then((d) => {
        setItems(d.data || d.feedback || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>User Feedback</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        Review user-submitted feedback
      </p>
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : items.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}
        >
          No feedback yet
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {items.map((f) => (
            <div key={f.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span
                  className={`badge ${f.type === "bug" ? "badge-danger" : f.type === "feature" ? "badge-info" : "badge-warning"}`}
                >
                  {f.type}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {new Date(f.created_at).toLocaleString()}
                </span>
              </div>
              <p style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>{f.message}</p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                <span>User: {f.user_id?.slice(0, 12)}...</span>
                {f.rating != null && (
                  <span>
                    Rating: {"★".repeat(f.rating)}
                    {"☆".repeat(5 - f.rating)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
