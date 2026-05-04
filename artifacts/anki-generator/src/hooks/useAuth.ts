import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

async function fetchAuthUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/user`, { credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json() as { user?: AuthUser | null };
    return json.user ?? null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth/user"],
    queryFn: fetchAuthUser,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User"
    : null;

  const initials = user
    ? (user.firstName?.[0] ?? user.email?.[0] ?? "U").toUpperCase()
    : null;

  return {
    user: user ?? null,
    isLoading,
    isLoggedIn: !!user,
    displayName,
    initials,
  };
}

export function getLoginUrl(returnTo?: string): string {
  const base = `${API_BASE}/api/login`;
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

export function getLogoutUrl(): string {
  return `${API_BASE}/api/logout`;
}
