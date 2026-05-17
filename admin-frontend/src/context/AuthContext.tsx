import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface AuthState {
  token: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const saved = localStorage.getItem("admin_token");
    if (saved) {
      try {
        const payload = JSON.parse(atob(saved.split(".")[1]));
        if (payload.exp * 1000 > Date.now()) {
          return { token: saved, role: payload.role, isAuthenticated: true, isLoading: false };
        }
      } catch {
        /* invalid token */
      }
    }
    return { token: null, role: null, isAuthenticated: false, isLoading: false };
  });

  const login = useCallback(async (email: string, password: string) => {
    // Use basic auth to get a JWT token from the admin endpoint
    const res = await fetch(`${API_BASE}/admin/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${email}:${password}`)}`,
      },
      body: JSON.stringify({ ttl_minutes: 480 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error?.message || "Authentication failed");
    }
    const data = await res.json();
    const token = data.data.token;
    const payload = JSON.parse(atob(token.split(".")[1]));
    localStorage.setItem("admin_token", token);
    setState({ token, role: payload.role, isAuthenticated: true, isLoading: false });
  }, []);

  const loginWithToken = useCallback((token: string) => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 <= Date.now()) {
        throw new Error("Token expired");
      }
      localStorage.setItem("admin_token", token);
      setState({ token, role: payload.role, isAuthenticated: true, isLoading: false });
    } catch {
      setState({ token: null, role: null, isAuthenticated: false, isLoading: false });
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("admin_token");
    setState({ token: null, role: null, isAuthenticated: false, isLoading: false });
  }, []);

  // Auto-logout on token expiry
  useEffect(() => {
    if (!state.token) return;
    try {
      const payload = JSON.parse(atob(state.token.split(".")[1]));
      const expiresAt = payload.exp * 1000;
      const timeout = expiresAt - Date.now();
      if (timeout <= 0) {
        logout();
        return;
      }
      const timer = setTimeout(logout, timeout);
      return () => clearTimeout(timer);
    } catch {
      logout();
    }
  }, [state.token, logout]);

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export { API_BASE };
