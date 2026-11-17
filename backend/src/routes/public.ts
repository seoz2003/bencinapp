import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import type { DB } from "../db.js";
import { nowIso, tx } from "../db.js";
import { brandName } from "../lib/brands.js";
import { isVisible, toApi, type DiscountRow } from "../lib/discounts.js";
import { FUELS } from "../lib/fuels.js";
import { lastSync } from "../sync.js";
import { discountInput, fuelEnum, priceReportInput, voteInput, voterId } from "./schemas.js";

const writeLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

function getVoter(req: Request): string | null {
  const v = voterId.safeParse(req.header("x-voter-id"));
  return v.success ? v.data : null;
}

export function publicRouter(db: DB) {
  const r = Router();
  const cardNames = () => new Map((db.prepare("SELECT id, name FROM cards").all() as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  r.get("/health", (_req, res) => {
    res.json({ ok: true, lastSync: lastSync(db) ?? null });
  });

  r.get("/meta", (_req, res) => {
    const brands = (db.prepare("SELECT brand, COUNT(*) AS n FROM stations GROUP BY brand ORDER BY n DESC").all() as { brand: string; n: number }[])
      .map((b) => ({ key: b.brand, name: brandName(b.brand), stations: b.n }));
    const cards = db.prepare("SELECT id, name, kind FROM cards ORDER BY sort, name").all();
    const total = (db.prepare("SELECT COUNT(*) AS n FROM stations").get() as { n: number }).n;
    res.json({ fuels: FUELS, cards, brands, stations: total, lastSync: lastSync(db) ?? null });
  });

  r.get("/comunas", (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const rows = db.prepare(`
      SELECT comuna, region, AVG(lat) AS lat, AVG(lon) AS lon, COUNT(*) AS stations
      FROM stations WHERE comuna <> '' ${q ? "AND comuna LIKE ? COLLATE NOCASE" : ""}
      GROUP BY comuna, region ORDER BY stations DESC LIMIT 400`).all(...(q ? [`%${q}%`] : []));
    res.json(rows);
  });

  r.get("/stations", (req, res) => {
    const fuel = fuelEnum.safeParse(req.query.fuel ?? "93");
    if (!fuel.success) return void res.status(400).json({ error: "Combustible inválido" });
    const limit = Math.min(Number(req.query.limit) || 600, 2500);
    const where = ["p.fuel = ?"];
    const params: (string | number)[] = [fuel.data];
    if (typeof req.query.bbox === "string") {
      const b = req.query.bbox.split(",").map(Number);
      if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) return void res.status(400).json({ error: "bbox inválido (oeste,sur,este,norte)" });
      where.push("s.lon BETWEEN ? AND ?", "s.lat BETWEEN ? AND ?");
      params.push(b[0], b[2], b[1], b[3]);
    }
    if (typeof req.query.comuna === "string" && req.query.comuna) { where.push("s.comuna = ?"); params.push(req.query.comuna); }
    const rows = db.prepare(`
      SELECT s.id, s.brand, s.address, s.comuna, s.region, s.lat, s.lon,
             p.price, p.attention, p.source_updated_at AS updatedAt
      FROM stations s JOIN prices p ON p.station_id = s.id
      WHERE ${where.join(" AND ")} ORDER BY p.price ASC LIMIT ?`).all(...params, limit) as { brand: string }[];
    res.json(rows.map((s) => ({ ...s, brandName: brandName(s.brand) })));
  });

  r.get("/stations/:id", (req, res) => {
    const s = db.prepare("SELECT * FROM stations WHERE id = ?").get(req.params.id) as { brand: string } | undefined;
    if (!s) return void res.status(404).json({ error: "Estación no encontrada" });
    const prices = db.prepare("SELECT fuel, price, attention, source_updated_at AS updatedAt FROM prices WHERE station_id = ?").all(req.params.id);
    const history = db.prepare(`SELECT fuel, price, recorded_at AS at FROM price_history
      WHERE station_id = ? AND recorded_at >= datetime('now', '-90 days') ORDER BY recorded_at`).all(req.params.id);
    res.json({ ...s, brandName: brandName(s.brand), prices, history });
  });

  r.get("/discounts", (req, res) => {
    const names = cardNames();
    const voter = getVoter(req);
    const myVotes = voter
      ? new Map((db.prepare("SELECT discount_id, value FROM votes WHERE voter_id = ?").all(voter) as { discount_id: number; value: number }[]).map((v) => [v.discount_id, v.value]))
      : new Map();
    const rows = (db.prepare("SELECT * FROM discounts ORDER BY verified DESC, score DESC, id").all() as unknown as DiscountRow[]).filter((d) => isVisible(d));
    res.json(rows.map((d) => ({ ...toApi(d, names.get(d.card_id)), brandName: brandName(d.brand), myVote: myVotes.get(d.id) ?? 0 })));
  });

  r.post("/discounts", writeLimiter, (req, res) => {
    const voter = getVoter(req);
    const body = discountInput.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "Datos inválidos", issues: body.error.issues });
    const d = body.data;
    if (!cardNames().has(d.cardId)) return void res.status(400).json({ error: "Tarjeta desconocida" });
    const info = db.prepare(`INSERT INTO discounts (card_id, brand, kind, value, days, conditions, max_liters, max_amount, valid_from, valid_to, source, author_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'community', ?, ?)`)
      .run(d.cardId, d.brand, d.kind, d.value, [...new Set(d.days)].sort().join(","), d.conditions, d.maxLiters ?? null, d.maxAmount ?? null, d.validFrom ?? null, d.validTo ?? null, voter, nowIso());
    const row = db.prepare("SELECT * FROM discounts WHERE id = ?").get(info.lastInsertRowid) as unknown as DiscountRow;
    res.status(201).json(toApi(row, cardNames().get(row.card_id)));
  });

  r.post("/discounts/:id/vote", writeLimiter, (req, res) => {
    const voter = getVoter(req);
    if (!voter) return void res.status(400).json({ error: "Falta el encabezado X-Voter-Id" });
    const body = voteInput.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "Voto inválido" });
    const id = Number(req.params.id);
    const d = db.prepare("SELECT id, source FROM discounts WHERE id = ?").get(id) as { source: string } | undefined;
    if (!d) return void res.status(404).json({ error: "Descuento no encontrado" });
    const score = tx(db, () => {
      if (body.data.value === 0) db.prepare("DELETE FROM votes WHERE discount_id=? AND voter_id=?").run(id, voter);
      else db.prepare(`INSERT INTO votes (discount_id, voter_id, value, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(discount_id, voter_id) DO UPDATE SET value=excluded.value`).run(id, voter, body.data.value, nowIso());
      const s = (db.prepare("SELECT COALESCE(SUM(value),0) AS s FROM votes WHERE discount_id=?").get(id) as { s: number }).s;
      db.prepare("UPDATE discounts SET score=? WHERE id=?").run(s, id);
      return s;
    });
    res.json({ id, score, myVote: body.data.value });
  });

  r.post("/price-reports", writeLimiter, (req, res) => {
    const body = priceReportInput.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: "Datos inválidos", issues: body.error.issues });
    const { stationId, fuel, price } = body.data;
    const official = db.prepare("SELECT price FROM prices WHERE station_id=? AND fuel=?").get(stationId, fuel) as { price: number } | undefined;
    if (!db.prepare("SELECT 1 FROM stations WHERE id=?").get(stationId)) return void res.status(404).json({ error: "Estación no encontrada" });
    db.prepare("INSERT INTO price_reports (station_id, fuel, price, official_price, reporter_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(stationId, fuel, price, official?.price ?? null, getVoter(req), nowIso());
    res.status(201).json({ ok: true, officialPrice: official?.price ?? null, difference: official ? price - official.price : null });
  });

  return r;
}
