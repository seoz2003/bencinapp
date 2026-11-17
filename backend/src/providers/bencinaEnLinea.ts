import { brandKey } from "../lib/brands.js";
import { isValidPrice, normalizeFuel, parsePrice } from "../lib/fuels.js";
import { attentionFrom, dedupePrices, fetchJson, type NormalizedPrice, type NormalizedStation, type PriceProvider } from "./types.js";

const BASE = "https://api.bencinaenlinea.cl/api";

/**
 * API pública que usa el sitio bencinaenlinea.cl (CNE/SEC). No requiere token,
 * pero no es una API documentada: úsala con moderación (aprox. 500 solicitudes/hora por IP).
 */
export class BencinaEnLineaProvider implements PriceProvider {
  name = "bencinaenlinea";

  async fetchStations(): Promise<NormalizedStation[]> {
    const [marcas, estaciones] = await Promise.all([
      fetchJson(`${BASE}/marca_ciudadano`) as Promise<{ data?: { id: number; nombre: string }[] }>,
      fetchJson(`${BASE}/busqueda_estacion_filtro`, {}, 120_000) as Promise<{ data?: unknown[] }>,
    ]);
    const marcaPorId = new Map((marcas.data ?? []).map((m) => [m.id, m.nombre]));
    return (estaciones.data ?? [])
      .map((e) => normalizeBelStation(e, marcaPorId))
      .filter((s): s is NormalizedStation => s !== null);
  }
}

type Obj = Record<string, unknown>;

export function normalizeBelStation(raw: unknown, marcas: Map<number, string>): NormalizedStation | null {
  const e = raw as Obj;
  const lat = parsePrice(e.latitud), lon = parsePrice(e.longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) return null;
  const prices: NormalizedPrice[] = [];
  for (const c of (e.combustibles ?? []) as Obj[]) {
    const fuel = normalizeFuel(c.nombre_corto as string);
    const price = parsePrice(c.precio);
    if (!fuel || !isValidPrice(fuel, price)) continue;
    prices.push({ fuel, price, attention: attentionFrom(c.tipo_atencion_nombre), updatedAt: (c.precio_fecha as string) ?? null });
  }
  return {
    id: `bel-${e.id}`,
    brand: brandKey(marcas.get(Number(e.marca)) ?? String(e.marca ?? "")),
    address: String(e.direccion ?? "").trim(),
    comuna: String(e.comuna ?? ""),
    region: String(e.region ?? ""),
    lat, lon,
    prices: dedupePrices(prices),
  };
}
