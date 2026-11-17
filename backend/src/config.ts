import path from "node:path";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  databasePath: process.env.DATABASE_PATH || path.resolve("data/bencinapp.db"),
  priceProvider: (process.env.PRICE_PROVIDER || "auto") as "auto" | "cne" | "bencinaenlinea" | "snapshot",
  cneEmail: process.env.CNE_EMAIL || "",
  cnePassword: process.env.CNE_PASSWORD || "",
  syncIntervalMinutes: num(process.env.SYNC_INTERVAL_MINUTES, 60),
  adminToken: process.env.ADMIN_TOKEN || "",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean),
  seedSnapshotPath: path.resolve(process.env.SEED_SNAPSHOT_PATH || "data/seed/snapshot.csv"),
  frontendDist: path.resolve(process.env.FRONTEND_DIST || "../frontend/dist"),
};
