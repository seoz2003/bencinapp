import type { FuelId } from "../lib/fuels.js";

export interface NormalizedPrice {
  fuel: FuelId;
  price: number;
  attention: "autoservicio" | "asistido" | null;
  updatedAt: string | null;
}

export interface NormalizedStation {
  id: string;
  brand: string; // clave normalizada (brandKey)
  address: string;
  comuna: string;
  region: string;
  lat: number;
  lon: number;
  prices: NormalizedPrice[];
}

export interface PriceProvider {
  name: string;
  fetchStations(): Promise<NormalizedStation[]>;
}

export function attentionFrom(v: unknown): NormalizedPrice["attention"] {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("auto")) return "autoservicio";
  if (s.includes("asist")) return "asistido";
  return null;
}

/** Deja un precio por combustible: el más bajo entre autoservicio y asistido. */
export function dedupePrices(prices: NormalizedPrice[]): NormalizedPrice[] {
  const best = new Map<FuelId, NormalizedPrice>();
  for (const p of prices) {
    const cur = best.get(p.fuel);
    if (!cur || p.price < cur.price) best.set(p.fuel, p);
  }
  return [...best.values()];
}

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": "bencinapp/0.1 (+https://github.com)", ...(init.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}
