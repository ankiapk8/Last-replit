import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Shield, Search, RefreshCw, Crown, User, ChevronLeft, ChevronRight,
  Check, X, Loader2, AlertCircle, UserCog,
} from "lucide-react";
import { apiUrl } from "@/lib/utils";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AdminUser {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  role: string;
  manual_pro: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  user:      { label: "User",      color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
  moderator: { label: "Moderator", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  admin:     { label: "Admin",     color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
};

function ProBadge({ user }: { user: AdminUser }) {
  const isManualPro = user.manual_pro === "true";
  const hasStripeSub = !!user.stripe_subscription_id;
  if (isManualPro) return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
      <Crown style={{ width: 10, height: 10 }} /> Manual PRO
    </span>
  );
  if (hasStripeSub) return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
      <Crown style={{ width: 10, height: 10 }} /> Stripe PRO
    </span>
  );
  return (
    <span className="text-xs text-muted-foreground/40">Free</span>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async (p: number, s: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "50" });
      if (s) params.set("search", s);
      const res = await fetch(apiUrl(`/api/admin/users?${params}`), { credentials: "include" });
      if (res.status === 401) { setError("Not authenticated. Please sign in."); return; }
      if (res.status === 403) { setError("Access denied. Moderator or Admin role required."); return; }
      if (!res.ok) { setError("Failed to load users."); return; }
      const data: UsersResponse = await res.json();
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(page, search); }, [page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const updateUser = async (userId: string, patch: { role?: string; manualPro?: boolean }) => {
    setUpdating(userId);
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Update failed");
      }
      const { user: updated }: { user: AdminUser } = await res.json();
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
      toast({ title: "User updated", description: `Changes saved for ${updated.email ?? updated.id}` });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <Shield className="w-6 h-6 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-sm text-muted-foreground">{total} total users</p>
          </div>
        </motion.div>

        <div className="flex gap-2 mb-6">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Search</Button>
            {search && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}>
                Clear
              </Button>
            )}
          </form>
          <Button variant="outline" size="sm" onClick={() => fetchUsers(page, search)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error ? (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-xl p-4 border border-destructive/20">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Plan</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Joined</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground">No users found</td>
                    </tr>
                  ) : users.map((user, i) => {
                    const isUpdating = updating === user.id;
                    const isManualPro = user.manual_pro === "true";
                    const roleConf = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.user;
                    return (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-t border-border hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {user.profile_image_url ? (
                              <img src={user.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium leading-tight">
                                {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">{user.email ?? user.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${roleConf.color}`}>
                            <UserCog style={{ width: 10, height: 10 }} />
                            {roleConf.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ProBadge user={user} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                          {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {isUpdating ? (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant={isManualPro ? "destructive" : "outline"}
                                  className="h-7 px-2.5 text-xs gap-1"
                                  onClick={() => updateUser(user.id, { manualPro: !isManualPro })}
                                  title={isManualPro ? "Revoke PRO" : "Grant PRO"}
                                >
                                  <Crown className="w-3 h-3" />
                                  {isManualPro ? "Revoke PRO" : "Grant PRO"}
                                </Button>
                                <select
                                  value={user.role}
                                  onChange={e => updateUser(user.id, { role: e.target.value })}
                                  className="h-7 text-xs bg-background border border-border rounded-md px-2 cursor-pointer"
                                  title="Change role"
                                >
                                  <option value="user">User</option>
                                  <option value="moderator">Moderator</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pages} — {total} users
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= pages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
