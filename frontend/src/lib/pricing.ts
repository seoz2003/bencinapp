import type { Discount, Station } from "./types";

export interface Priced extends Station {
  final: number;
  discount: Discount | null;
  discountPerLiter: number;
  distanceKm: number | null;
  stale: boolean;
}

/** Días tras los cuales un precio se considera desactualizado (no compite por "más barato"). */
export const STALE_DAYS = 21;
export function isStale(updatedAt: string | null, now = Date.now()): boolean {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt.replace(" ", "T"));
  return Number.isFinite(t) && now - t > STALE_DAYS * 86_400_000;
}

/** Descuento total en $ para una carga de `liters` litros, respetando topes de litros y de monto. */
export function discountAmount(d: Discount, pricePerLiter: number, liters: number): number {
  const l = Math.min(liters, d.maxLiters ?? liters);
  let total = d.kind === "litro" ? d.value * l : (pricePerLiter * l * d.value) / 100;
  if (d.maxAmount != null) total = Math.min(total, d.maxAmount);
  return Math.max(0, total);
}

/** Mejor descuento aplicable a una estación según las tarjetas del usuario y el día. */
export function bestDiscount(st: Station, discounts: Discount[], cards: Set<string>, day: number, liters: number) {
  let best: Discount | null = null, bestPerLiter = 0;
  for (const d of discounts) {
    if (d.brand !== st.brand || !cards.has(d.cardId) || !d.days.includes(day)) continue;
    const perLiter = discountAmount(d, st.price, liters) / liters;
    if (perLiter > bestPerLiter) { best = d; bestPerLiter = perLiter; }
  }
  return { discount: best, perLiter: bestPerLiter };
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function priceStations(
  stations: Station[], discounts: Discount[], cards: Set<string>, day: number, liters: number, here: [number, number] | null,
): Priced[] {
  return stations.map((s) => {
    const { discount, perLiter } = bestDiscount(s, discounts, cards, day, liters);
    return { ...s, discount, discountPerLiter: perLiter, final: s.price - perLiter, stale: isStale(s.updatedAt), distanceKm: here ? haversineKm(here, [s.lat, s.lon]) : null };
  });
}

export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
export const discountLabel = (d: Discount) => (d.kind === "litro" ? `${fmt(d.value)}/L` : `${d.value}%`);
export const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const BRAND_COLORS: Record<string, string> = {
  COPEC: "#d62828", SHELL: "#e0a800", ARAMCO: "#00843d", JLC: "#1d4e89", TERPEL: "#c8102e",
  GULF: "#f47b20", ABASTIBLE: "#0057b8", HN: "#5b2a86",
};
export const brandColor = (k: string) => BRAND_COLORS[k] ?? "#6b7380";
