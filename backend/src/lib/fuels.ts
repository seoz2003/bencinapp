export const FUELS = [
  { id: "93", name: "93" },
  { id: "95", name: "95" },
  { id: "97", name: "97" },
  { id: "DI", name: "Diésel" },
  { id: "KE", name: "Kerosene" },
  { id: "GLP", name: "GLP" },
  { id: "GNC", name: "GNC" },
] as const;

export type FuelId = (typeof FUELS)[number]["id"];
const FUEL_IDS = new Set<string>(FUELS.map((f) => f.id));

/** Rango razonable de precio por combustible ($/L o $/m3). Fuera de esto se descarta como error de la fuente. */
const VALID_RANGE: Record<FuelId, [number, number]> = {
  "93": [500, 2500], "95": [500, 2500], "97": [500, 2500],
  DI: [400, 2500], KE: [300, 2000], GLP: [200, 1500], GNC: [150, 1500],
};

/**
 * Normaliza el código corto de la fuente. Bencina en Línea publica el mismo combustible
 * con y sin prefijo "A" según el tipo de atención (por ejemplo 93 y A93).
 */
export function normalizeFuel(code: string | null | undefined): FuelId | null {
  if (!code) return null;
  let c = String(code).trim().toUpperCase();
  if (FUEL_IDS.has(c)) return c as FuelId;
  if (c.startsWith("A")) c = c.slice(1);
  return FUEL_IDS.has(c) ? (c as FuelId) : null;
}

export function isValidPrice(fuel: FuelId, price: number): boolean {
  const [min, max] = VALID_RANGE[fuel];
  return Number.isFinite(price) && price >= min && price <= max;
}

export function parsePrice(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(String(v ?? "").replace(",", "."));
}
