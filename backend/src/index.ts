import { config } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { seedReferenceData } from "./seed.js";
import { runSync, stationCount } from "./sync.js";

const db = openDb(config.databasePath);
seedReferenceData(db);

async function syncSafe() {
  try {
    const r = await runSync(db);
    console.log(`[sync] ${r.provider}: ${r.stations} estaciones, ${r.prices} precios, ${r.changed} cambios`);
  } catch (e) {
    console.error("[sync]", e instanceof Error ? e.message : e);
  }
}

const app = createApp(db);
app.listen(config.port, () => {
  console.log(`Bencinapp API escuchando en http://localhost:${config.port}`);
});

// Primera sincronización al partir (si la base está vacía se espera a que termine la semilla).
if (stationCount(db) === 0 || config.syncIntervalMinutes > 0) void syncSafe();
if (config.syncIntervalMinutes > 0) setInterval(syncSafe, config.syncIntervalMinutes * 60_000).unref();
