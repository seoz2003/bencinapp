import { config } from "../config.js";
import { openDb } from "../db.js";
import { seedReferenceData } from "../seed.js";
import { runSync } from "../sync.js";

const db = openDb(config.databasePath);
seedReferenceData(db);
runSync(db)
  .then((r) => console.log(`OK ${r.provider}: ${r.stations} estaciones, ${r.prices} precios, ${r.changed} cambios`))
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
