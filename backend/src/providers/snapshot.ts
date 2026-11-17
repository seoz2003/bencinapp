import fs from "node:fs";
import { brandKey } from "../lib/brands.js";
import { parseCsv } from "../lib/csv.js";
import { isValidPrice, normalizeFuel, parsePrice } from "../lib/fuels.js";
import { attentionFrom, dedupePrices, type NormalizedStation, type PriceProvider } from "./types.js";

/**
 * Carga un snapshot CSV (formato de diland9/precios-combustibles-chile, licencia MIT).
 * Sirve como semilla para desarrollo o cuando no hay acceso a las APIs.
 */
export class SnapshotProvider implements PriceProvider {
  name = "snapshot";
  constructor(private file: string) {}

  async fetchStations(): Promise<NormalizedStation[]> {
    return parseSnapshot(fs.readFileSync(this.file, "utf8"));
  }
}

export function parseSnapshot(text: string): NormalizedStation[] {
  const byId = new Map<string, NormalizedStation>();
  for (const r of parseCsv(text)) {
    const lat = parsePrice(r.latitud), lon = parsePrice(r.longitud);
    if (!r.estacion_id || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) continue;
    const id = `bel-${r.estacion_id}`;
    let st = byId.get(id);
    if (!st) {
      st = { id, brand: brandKey(r.marca), address: r.direccion.trim(), comuna: r.comuna, region: r.region, lat, lon, prices: [] };
      byId.set(id, st);
    }
    const fuel = normalizeFuel(r.combustible_corto);
    const price = parsePrice(r.precio);
    if (fuel && isValidPrice(fuel, price)) {
      st.prices.push({ fuel, price, attention: attentionFrom(r.tipo_atencion), updatedAt: r.precio_fecha_origen || null });
    }
  }
  return [...byId.values()].map((s) => ({ ...s, prices: dedupePrices(s.prices) }));
}
