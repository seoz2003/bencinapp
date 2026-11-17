import { config } from "./config.js";
import { nowIso, tx, type DB } from "./db.js";
import { BencinaEnLineaProvider } from "./providers/bencinaEnLinea.js";
import { CneProvider } from "./providers/cne.js";
import { SnapshotProvider } from "./providers/snapshot.js";
import type { NormalizedStation, PriceProvider } from "./providers/types.js";

let cneSingleton: CneProvider | null = null;

/** Orden de proveedores a intentar según PRICE_PROVIDER. */
export function providerChain(db: DB): PriceProvider[] {
  const cne = () => (cneSingleton ??= new CneProvider(config.cneEmail, config.cnePassword));
  const hasCne = Boolean(config.cneEmail && config.cnePassword);
  switch (config.priceProvider) {
    case "cne": return [cne()];
    case "bencinaenlinea": return [new BencinaEnLineaProvider()];
    case "snapshot": return [new SnapshotProvider(config.seedSnapshotPath)];
    default: {
      const chain: PriceProvider[] = [];
      if (hasCne) chain.push(cne());
      chain.push(new BencinaEnLineaProvider());
      // El snapshot semilla solo se usa si la base está vacía, para no pisar datos más nuevos.
      if (stationCount(db) === 0) chain.push(new SnapshotProvider(config.seedSnapshotPath));
      return chain;
    }
  }
}

export function stationCount(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM stations").get() as { n: number }).n;
}

export interface SyncResult { provider: string; stations: number; prices: number; changed: number }

export async function runSync(db: DB, chain = providerChain(db)): Promise<SyncResult> {
  const errors: string[] = [];
  for (const provider of chain) {
    const started = nowIso();
    const run = db.prepare("INSERT INTO sync_runs (provider, started_at) VALUES (?, ?)").run(provider.name, started);
    try {
      const stations = await provider.fetchStations();
      if (stations.length < 50) throw new Error(`Respuesta sospechosa: solo ${stations.length} estaciones`);
      const res = saveStations(db, stations);
      db.prepare("UPDATE sync_runs SET finished_at=?, stations=?, prices=?, ok=1 WHERE id=?")
        .run(nowIso(), res.stations, res.prices, run.lastInsertRowid);
      return { provider: provider.name, ...res };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${provider.name}: ${msg}`);
      db.prepare("UPDATE sync_runs SET finished_at=?, ok=0, error=? WHERE id=?").run(nowIso(), msg, run.lastInsertRowid);
      console.warn(`[sync] ${provider.name} falló: ${msg}`);
    }
  }
  throw new Error(`Ningún proveedor respondió. ${errors.join(" | ")}`);
}

export function saveStations(db: DB, stations: NormalizedStation[]) {
  const now = nowIso();
  const upStation = db.prepare(`
    INSERT INTO stations (id, brand, address, comuna, region, lat, lon, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET brand=excluded.brand, address=excluded.address, comuna=excluded.comuna,
      region=excluded.region, lat=excluded.lat, lon=excluded.lon, updated_at=excluded.updated_at`);
  const getPrice = db.prepare("SELECT price FROM prices WHERE station_id=? AND fuel=?");
  const upPrice = db.prepare(`
    INSERT INTO prices (station_id, fuel, price, attention, source_updated_at, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(station_id, fuel) DO UPDATE SET price=excluded.price, attention=excluded.attention,
      source_updated_at=excluded.source_updated_at, fetched_at=excluded.fetched_at`);
  const addHistory = db.prepare("INSERT INTO price_history (station_id, fuel, price, recorded_at) VALUES (?, ?, ?, ?)");

  let prices = 0, changed = 0;
  tx(db, () => {
    db.exec("CREATE TEMP TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY); DELETE FROM seen;");
    const markSeen = db.prepare("INSERT OR IGNORE INTO seen (id) VALUES (?)");
    for (const s of stations) {
      upStation.run(s.id, s.brand, s.address, s.comuna, s.region, s.lat, s.lon, now);
      markSeen.run(s.id);
      for (const p of s.prices) {
        const prev = getPrice.get(s.id, p.fuel) as { price: number } | undefined;
        if (!prev || prev.price !== p.price) {
          addHistory.run(s.id, p.fuel, p.price, now);
          changed++;
        }
        upPrice.run(s.id, p.fuel, p.price, p.attention, p.updatedAt, now);
        prices++;
      }
    }
    // Las estaciones que ya no informa la fuente se eliminan (sus precios caen en cascada).
    db.exec("DELETE FROM stations WHERE id NOT IN (SELECT id FROM seen)");
  });
  return { stations: stations.length, prices, changed };
}

export function lastSync(db: DB) {
  return db.prepare("SELECT provider, finished_at AS finishedAt, stations FROM sync_runs WHERE ok=1 ORDER BY id DESC LIMIT 1").get() as
    | { provider: string; finishedAt: string; stations: number }
    | undefined;
}
