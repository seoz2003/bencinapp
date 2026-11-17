import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import type { DB } from "./db.js";
import { adminRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";

export function createApp(db: DB, opts: { adminToken?: string; frontendDist?: string } = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "50kb" }));

  app.use("/api", publicRouter(db));
  app.use("/api/admin", adminRouter(db, opts.adminToken ?? config.adminToken));
  app.use("/api", (_req, res) => void res.status(404).json({ error: "No encontrado" }));

  // En producción el backend también sirve el frontend compilado.
  const dist = opts.frontendDist ?? config.frontendDist;
  if (fs.existsSync(path.join(dist, "index.html"))) {
    app.use(express.static(dist, { maxAge: "1h", index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Error interno" });
  });
  return app;
}
