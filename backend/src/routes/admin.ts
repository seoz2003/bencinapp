import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { nowIso, type DB } from "../db.js";
import { toApi, type DiscountRow } from "../lib/discounts.js";
import { runSync } from "../sync.js";
import { adminDiscountPatch, discountInput } from "./schemas.js";

function requireAdmin(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const got = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const ok = token.length >= 16 && got.length === token.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token));
    if (!ok) return void res.status(401).json({ error: token.length < 16 ? "ADMIN_TOKEN no configurado (mínimo 16 caracteres)" : "No autorizado" });
    next();
  };
}

export function adminRouter(db: DB, adminToken: string) {
  const r = Router();
  r.use(requireAdmin(adminToken));
  const names = () => new Map((db.prepare("SELECT id, name FROM cards").all() as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const getDiscount = (id: number | bigint) => db.prepare("SELECT * FROM discounts WHERE id=?").get(id) as unknown as DiscountRow | undefined;

  r.get("/ping", (_req, res) => void res.json({ ok: true }));

  r.get("/discounts", (_req, res) => {
    const n = names();
    res.json((db.prepare("SELECT * FROM discounts ORDER BY created_at DESC").all() as unknown as DiscountRow[]).map((d) => toApi(d, n.get(d.card_id))));
  });

  r.post("/discounts", (req, res) => {
    const body = discountInput.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "Datos inválidos", issues: body.error.issues });
    const d = body.data;
    if (!names().has(d.cardId)) return void res.status(400).json({ error: "Tarjeta desconocida" });
    const info = db.prepare(`INSERT INTO discounts (card_id, brand, kind, value, days, conditions, max_liters, max_amount, valid_from, valid_to, source, verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 1, ?)`)
      .run(d.cardId, d.brand, d.kind, d.value, [...new Set(d.days)].sort().join(","), d.conditions, d.maxLiters ?? null, d.maxAmount ?? null, d.validFrom ?? null, d.validTo ?? null, nowIso());
    res.status(201).json(toApi(getDiscount(info.lastInsertRowid)!, names().get(d.cardId)));
  });

  r.patch("/discounts/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!getDiscount(id)) return void res.status(404).json({ error: "No encontrado" });
    const body = adminDiscountPatch.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "Datos inválidos", issues: body.error.issues });
    const map: Record<string, [string, (v: unknown) => unknown]> = {
      cardId: ["card_id", (v) => v], brand: ["brand", (v) => v], kind: ["kind", (v) => v], value: ["value", (v) => v],
      days: ["days", (v) => [...new Set(v as number[])].sort().join(",")], conditions: ["conditions", (v) => v],
      maxLiters: ["max_liters", (v) => v], maxAmount: ["max_amount", (v) => v], validFrom: ["valid_from", (v) => v],
      validTo: ["valid_to", (v) => v], verified: ["verified", (v) => (v ? 1 : 0)], hidden: ["hidden", (v) => (v ? 1 : 0)],
      sample: ["sample", (v) => (v ? 1 : 0)],
    };
    const sets: string[] = [], vals: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(body.data)) {
      if (v === undefined || !map[k]) continue;
      sets.push(`${map[k][0]} = ?`);
      vals.push(map[k][1](v) as string | number | null);
    }
    if (sets.length) db.prepare(`UPDATE discounts SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
    const d = getDiscount(id)!;
    res.json(toApi(d, names().get(d.card_id)));
  });

  r.delete("/discounts/:id", (req, res) => {
    const info = db.prepare("DELETE FROM discounts WHERE id=?").run(Number(req.params.id));
    res.status(info.changes ? 204 : 404).end();
  });

  r.get("/reports", (req, res) => {
    const resolved = req.query.resolved === "1" ? 1 : 0;
    res.json(db.prepare(`SELECT r.*, s.brand, s.address, s.comuna FROM price_reports r LEFT JOIN stations s ON s.id = r.station_id
      WHERE r.resolved = ? ORDER BY r.created_at DESC LIMIT 300`).all(resolved));
  });

  r.patch("/reports/:id", (req, res) => {
    db.prepare("UPDATE price_reports SET resolved=? WHERE id=?").run(req.body?.resolved ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });

  r.post("/cards", (req, res) => {
    const { id, name, kind } = req.body ?? {};
    if (typeof id !== "string" || !/^[a-z0-9-]{2,40}$/.test(id) || typeof name !== "string" || !name.trim())
      return void res.status(400).json({ error: "id (a-z, 0-9, guiones) y nombre son obligatorios" });
    db.prepare("INSERT INTO cards (id, name, kind, sort) VALUES (?, ?, ?, 100) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind")
      .run(id, name.trim(), ["banco", "retail", "app"].includes(kind) ? kind : "banco");
    res.status(201).json({ id, name, kind });
  });

  r.get("/sync-runs", (_req, res) => {
    res.json(db.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 30").all());
  });

  r.post("/sync", async (_req, res) => {
    try {
      res.json(await runSync(db));
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return r;
}
