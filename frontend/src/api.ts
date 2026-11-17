import type { Comuna, Discount, Meta, Station } from "./lib/types";

function voterId(): string {
  try {
    let v = localStorage.getItem("bencinapp.voter");
    if (!v) { v = crypto.randomUUID(); localStorage.setItem("bencinapp.voter", v); }
    return v;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2, 12);
  }
}
const VOTER = voterId();

async function req<T>(path: string, init: RequestInit = {}, adminToken?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json", "X-Voter-Id": VOTER,
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}), ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  meta: () => req<Meta>("/meta"),
  stations: (fuel: string, bbox: [number, number, number, number]) => req<Station[]>(`/stations?fuel=${fuel}&bbox=${bbox.map((n) => n.toFixed(5)).join(",")}&limit=1500`),
  station: (id: string) => req<Station & { prices: { fuel: string; price: number }[]; history: { fuel: string; price: number; at: string }[] }>(`/stations/${encodeURIComponent(id)}`),
  comunas: (q = "") => req<Comuna[]>(`/comunas?q=${encodeURIComponent(q)}`),
  discounts: () => req<Discount[]>("/discounts"),
  createDiscount: (body: unknown) => req<Discount>("/discounts", { method: "POST", body: JSON.stringify(body) }),
  vote: (id: number, value: -1 | 0 | 1) => req<{ score: number; myVote: number }>(`/discounts/${id}/vote`, { method: "POST", body: JSON.stringify({ value }) }),
  reportPrice: (body: { stationId: string; fuel: string; price: number }) =>
    req<{ officialPrice: number | null; difference: number | null }>("/price-reports", { method: "POST", body: JSON.stringify(body) }),
  admin: {
    ping: (t: string) => req<{ ok: true }>("/admin/ping", {}, t),
    discounts: (t: string) => req<Discount[]>("/admin/discounts", {}, t),
    createDiscount: (t: string, body: unknown) => req<Discount>("/admin/discounts", { method: "POST", body: JSON.stringify(body) }, t),
    patchDiscount: (t: string, id: number, body: unknown) => req<Discount>(`/admin/discounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }, t),
    deleteDiscount: (t: string, id: number) => req<void>(`/admin/discounts/${id}`, { method: "DELETE" }, t),
    reports: (t: string) => req<Record<string, unknown>[]>("/admin/reports", {}, t),
    resolveReport: (t: string, id: number) => req(`/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ resolved: true }) }, t),
    syncRuns: (t: string) => req<Record<string, unknown>[]>("/admin/sync-runs", {}, t),
    sync: (t: string) => req<{ provider: string; stations: number; changed: number }>("/admin/sync", { method: "POST" }, t),
    addCard: (t: string, body: unknown) => req("/admin/cards", { method: "POST", body: JSON.stringify(body) }, t),
  },
};
