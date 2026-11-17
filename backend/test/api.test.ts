import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { SnapshotProvider } from "../src/providers/snapshot.js";
import { seedReferenceData } from "../src/seed.js";
import { runSync } from "../src/sync.js";

const ADMIN = "token-de-prueba-123456";
const db = openDb(":memory:");
let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
const voter = { "Content-Type": "application/json", "X-Voter-Id": "voter-abc-123" };

before(async () => {
  seedReferenceData(db);
  await runSync(db, [new SnapshotProvider("data/seed/snapshot.csv")]);
  server = createApp(db, { adminToken: ADMIN, frontendDist: "/nonexistent" }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

test("meta y estaciones con datos de la semilla", async () => {
  const meta = await (await fetch(`${base}/meta`)).json();
  assert.ok(meta.stations > 1000);
  assert.ok(meta.cards.length > 5);
  const st = await (await fetch(`${base}/stations?fuel=93&bbox=-73.2,-37.0,-72.9,-36.7`)).json();
  assert.ok(st.length > 10, "hay estaciones en Gran Concepción");
  assert.ok(st[0].price <= st[st.length - 1].price, "ordenadas por precio");
  const detail = await (await fetch(`${base}/stations/${st[0].id}`)).json();
  assert.ok(detail.prices.length >= 1);
});

test("bbox inválido devuelve 400", async () => {
  assert.equal((await fetch(`${base}/stations?bbox=1,2`)).status, 400);
});

test("descuento comunitario, votos y ocultamiento", async () => {
  const res = await fetch(`${base}/discounts`, {
    method: "POST", headers: voter,
    body: JSON.stringify({ cardId: "tenpo", brand: "aramco", kind: "litro", value: 50, days: [4] }),
  });
  assert.equal(res.status, 201);
  const d = await res.json();
  assert.equal(d.brand, "ARAMCO");
  assert.equal(d.source, "community");

  for (const v of ["a", "b", "c"]) {
    const r = await fetch(`${base}/discounts/${d.id}/vote`, {
      method: "POST", headers: { ...voter, "X-Voter-Id": `voter-${v}-000000` }, body: JSON.stringify({ value: -1 }),
    });
    assert.equal(r.status, 200);
  }
  const list = await (await fetch(`${base}/discounts`)).json();
  assert.ok(!list.some((x: { id: number }) => x.id === d.id), "con -3 votos se oculta");
});

test("admin requiere token y puede crear descuentos verificados", async () => {
  assert.equal((await fetch(`${base}/admin/discounts`)).status, 401);
  const res = await fetch(`${base}/admin/discounts`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ cardId: "santander", brand: "SHELL", kind: "pct", value: 5, days: [0, 6], maxAmount: 5000 }),
  });
  assert.equal(res.status, 201);
  const d = await res.json();
  assert.equal(d.verified, true);
  const p = await fetch(`${base}/admin/discounts/${d.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ hidden: true }),
  });
  assert.equal((await p.json()).hidden, true);
});

test("reporte de precio calcula diferencia", async () => {
  const [s] = await (await fetch(`${base}/stations?fuel=95&limit=1`)).json();
  const r = await fetch(`${base}/price-reports`, { method: "POST", headers: voter, body: JSON.stringify({ stationId: s.id, fuel: "95", price: s.price + 10 }) });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).difference, 10);
});
