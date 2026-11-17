import { brandKey } from "../lib/brands.js";
import { isValidPrice, normalizeFuel, parsePrice } from "../lib/fuels.js";
import { attentionFrom, dedupePrices, fetchJson, type NormalizedPrice, type NormalizedStation, type PriceProvider } from "./types.js";

const BASE = "https://api.cne.cl/api";

/** Decodifica la fecha de expiración (ms) de un JWT sin validar la firma. */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * API oficial de la CNE (https://api.cne.cl). Requiere registro gratuito.
 * Flujo: POST /api/login {email, password} -> {token}; GET /api/v4/estaciones con Bearer token.
 */
export class CneProvider implements PriceProvider {
  name = "cne";
  private token: string | null = null;
  private tokenExp = 0;

  constructor(private email: string, private password: string) {}

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExp - 5 * 60_000) return this.token;
    const r = (await fetchJson(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    })) as { token?: string; access_token?: string };
    const token = r.token ?? r.access_token;
    if (!token) throw new Error("La CNE no devolvió un token. Revisa CNE_EMAIL y CNE_PASSWORD.");
    this.token = token;
    this.tokenExp = jwtExpiry(token) ?? Date.now() + 60 * 60_000;
    return token;
  }

  async fetchStations(): Promise<NormalizedStation[]> {
    const token = await this.getToken();
    const r = await fetchJson(`${BASE}/v4/estaciones`, { headers: { Authorization: `Bearer ${token}` } }, 120_000);
    const rows = Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? []);
    return rows.map(normalizeCneStation).filter((s): s is NormalizedStation => s !== null);
  }
}

type Obj = Record<string, unknown>;

export function normalizeCneStation(raw: unknown): NormalizedStation | null {
  const s = raw as Obj;
  const u = (s.ubicacion ?? {}) as Obj;
  const lat = parsePrice(u.latitud), lon = parsePrice(u.longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0) return null;
  const precios = (s.precios ?? {}) as Record<string, Obj>;
  const prices: NormalizedPrice[] = [];
  for (const [code, info] of Object.entries(precios)) {
    const fuel = normalizeFuel(code);
    if (!fuel || !info || typeof info !== "object") continue;
    const price = parsePrice(info.precio);
    if (!isValidPrice(fuel, price)) continue;
    const fecha = info.fecha_actualizacion ? String(info.fecha_actualizacion) : null;
    const hora = info.hora_actualizacion ? String(info.hora_actualizacion) : "00:00:00";
    prices.push({ fuel, price, attention: attentionFrom(info.tipo_atencion), updatedAt: fecha ? `${fecha} ${hora}` : null });
  }
  const dist = (s.distribuidor ?? {}) as Obj;
  return {
    id: `cne-${s.codigo ?? s.id}`,
    brand: brandKey((dist.marca ?? dist.nombre) as string),
    address: String(u.direccion ?? "").trim(),
    comuna: String(u.nombre_comuna ?? ""),
    region: String(u.nombre_region ?? ""),
    lat, lon,
    prices: dedupePrices(prices),
  };
}
