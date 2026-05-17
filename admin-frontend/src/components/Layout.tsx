import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard" },
  { path: "/providers", label: "Providers" },
  { path: "/modes", label: "Modes" },
  { path: "/tools", label: "Tools" },
  { path: "/mcp", label: "MCP Servers" },
  { path: "/api-keys", label: "API Keys" },
  { path: "/audit", label: "Audit Log" },
  { path: "/users", label: "Users" },
  { path: "/feedback", label: "Feedback" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout, role } = useAuth();
  const location = useLocation();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          height: "100vh",
        }}
      >
        <div style={{ padding: "20px 16px", borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            ⚙️ AnkiGen Admin
          </h1>
          {role && (
            <span className="badge badge-info" style={{ marginTop: 4 }}>
              {role}
            </span>
          )}
        </div>
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: 6,
                marginBottom: 2,
                background: location.pathname === item.path ? "var(--bg-hover)" : "transparent",
                color:
                  location.pathname === item.path ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: location.pathname === item.path ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <button className="btn-ghost" onClick={logout} style={{ width: "100%" }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: 240, flex: 1, padding: "24px 32px" }}>{children}</main>
    </div>
  );
}
