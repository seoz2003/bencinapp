import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE stations (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    comuna TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_stations_geo ON stations(lat, lon);
  CREATE INDEX idx_stations_comuna ON stations(comuna);

  CREATE TABLE prices (
    station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    fuel TEXT NOT NULL,
    price REAL NOT NULL,
    attention TEXT,
    source_updated_at TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (station_id, fuel)
  );
  CREATE INDEX idx_prices_fuel ON prices(fuel, price);

  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    fuel TEXT NOT NULL,
    price REAL NOT NULL,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX idx_history ON price_history(station_id, fuel, recorded_at);

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'banco',
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL REFERENCES cards(id),
    brand TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('litro','pct')),
    value REAL NOT NULL,
    days TEXT NOT NULL,
    conditions TEXT NOT NULL DEFAULT '',
    max_liters REAL,
    max_amount REAL,
    valid_from TEXT,
    valid_to TEXT,
    source TEXT NOT NULL CHECK (source IN ('admin','community')),
    verified INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    sample INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    author_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE votes (
    discount_id INTEGER NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (discount_id, voter_id)
  );

  CREATE TABLE price_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    fuel TEXT NOT NULL,
    price REAL NOT NULL,
    official_price REAL,
    reporter_id TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    stations INTEGER NOT NULL DEFAULT 0,
    prices INTEGER NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
  `,
];

export type DB = DatabaseSync;

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DB) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let v = row?.version ?? 0;
  if (!row) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  for (; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.prepare("UPDATE schema_version SET version = ?").run(v + 1);
    });
  }
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();
