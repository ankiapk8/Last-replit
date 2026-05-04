import { useQuery } from "@tanstack/react-query";
import { devSidHeaders } from "@/lib/dev-sid";

export interface SubscriptionStatus {
  isPro: boolean;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  reason?: string;
  devOverride?: boolean;
  simulated?: boolean;
}

export interface UsageStatus {
  decks: number;
  deckLimit: number | null;
  exports: number;
  exportLimit: number | null;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/subscription/status`, {
      credentials: "include",
      cache: "no-store",
      headers: devSidHeaders(),
    });
    if (!res.ok) return { isPro: false, subscription: null };
    return res.json();
  } catch {
    return { isPro: false, subscription: null };
  }
}

async function fetchUsageStatus(): Promise<UsageStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/subscription/usage`, {
      credentials: "include",
      headers: devSidHeaders(),
    });
    if (!res.ok) return { decks: 0, deckLimit: 2, exports: 0, exportLimit: 1 };
    return res.json();
  } catch {
    return { decks: 0, deckLimit: 2, exports: 0, exportLimit: 1 };
  }
}

export function useSubscription() {
  const { data, isLoading, refetch } = useQuery<SubscriptionStatus>({
    queryKey: ["subscription/status"],
    queryFn: fetchSubscriptionStatus,
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    isPro: data?.isPro ?? false,
    subscription: data?.subscription ?? null,
    isLoading,
    refetch,
  };
}

export function useUsage() {
  const { data, isLoading } = useQuery<UsageStatus>({
    queryKey: ["subscription/usage"],
    queryFn: fetchUsageStatus,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
    retry: 1,
  });

  return {
    decks: data?.decks ?? 0,
    deckLimit: data?.deckLimit ?? 2,
    exports: data?.exports ?? 0,
    exportLimit: data?.exportLimit ?? 1,
    isLoading,
  } as { decks: number; deckLimit: number | null; exports: number; exportLimit: number | null; isLoading: boolean };
}

export async function fetchStripeConfigured(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/subscription/stripe-configured`);
    if (!res.ok) return false;
    const json = await res.json() as Record<string, unknown>;
    return json.configured === true;
  } catch {
    return false;
  }
}

export async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/api/subscription/products`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function startCheckout(priceId: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/subscription/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ priceId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Checkout failed");
  }
  const data = await res.json() as Record<string, unknown>;
  return typeof data.url === "string" ? data.url : null;
}

export async function openBillingPortal(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/subscription/portal`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof body.error === "string" ? body.error : "Portal access failed");
  }
  const data = await res.json() as Record<string, unknown>;
  return typeof data.url === "string" ? data.url : null;
}
