import assert from "node:assert/strict";
import { test } from "node:test";
import { brandKey } from "../src/lib/brands.js";
import { parseCsv } from "../src/lib/csv.js";
import { normalizeFuel } from "../src/lib/fuels.js";
import { normalizeBelStation } from "../src/providers/bencinaEnLinea.js";
import { jwtExpiry, normalizeCneStation } from "../src/providers/cne.js";
import { parseSnapshot } from "../src/providers/snapshot.js";

test("normalizeFuel unifica códigos con prefijo A", () => {
  assert.equal(normalizeFuel("A93"), "93");
  assert.equal(normalizeFuel("ADI"), "DI");
  assert.equal(normalizeFuel("KE"), "KE");
  assert.equal(normalizeFuel("XYZ"), null);
});

test("brandKey normaliza marcas", () => {
  assert.equal(brandKey(" copec "), "COPEC");
  assert.equal(brandKey("Sin Bandera"), "SIN BANDERA");
  assert.equal(brandKey("Petrobras"), "ARAMCO");
});

test("parseCsv respeta comillas y comas internas", () => {
  const rows = parseCsv('a,b\n"x, y","z ""q"""\n');
  assert.deepEqual(rows, [{ a: "x, y", b: 'z "q"' }]);
});

test("normalizeCneStation lee el formato v4 y descarta precios inválidos", () => {
  const s = normalizeCneStation({
    codigo: "co123", distribuidor: { marca: "COPEC" },
    ubicacion: { direccion: "Paicaví 1248 ", nombre_comuna: "Concepción", nombre_region: "Biobío", latitud: "-36.81", longitud: "-73.04" },
    precios: {
      "93": { precio: "1593", fecha_actualizacion: "2026-11-12", hora_actualizacion: "07:01:23" },
      A93: { precio: "1580,5" },
      DI: { precio: "0" },
    },
  })!;
  assert.equal(s.id, "cne-co123");
  assert.equal(s.address, "Paicaví 1248");
  assert.equal(s.prices.length, 1);
  assert.equal(s.prices[0].price, 1580.5);
});

test("normalizeBelStation usa el mapa de marcas", () => {
  const s = normalizeBelStation(
    { id: 857, marca: 3, region: "Biobío", comuna: "Concepción", direccion: "X", latitud: -36.8, longitud: -73.0,
      combustibles: [{ nombre_corto: "93", precio: "1593.000", tipo_atencion_nombre: "AutoServicio" }] },
    new Map([[3, "SHELL"]]),
  )!;
  assert.equal(s.brand, "SHELL");
  assert.equal(s.prices[0].attention, "autoservicio");
});

test("parseSnapshot agrupa por estación y deja el precio más bajo", () => {
  const csv = `fecha,estacion_id,marca,region,comuna,direccion,latitud,longitud,combustible_corto,combustible_largo,precio,unidad_cobro,tipo_atencion,precio_fecha_origen
2026-11-17,857,COPEC,Biobío,Concepción,"PAICAVI 1248",-36.81,-73.04,93,Gasolina 93,1600.000,$/L,AutoServicio,2026-11-12 07:01:23
2026-11-17,857,COPEC,Biobío,Concepción,"PAICAVI 1248",-36.81,-73.04,A93,Gasolina 93,1593.000,$/L,Asistido,2026-11-12 07:01:23
`;
  const [s] = parseSnapshot(csv);
  assert.equal(s.prices.length, 1);
  assert.equal(s.prices[0].price, 1593);
  assert.equal(s.prices[0].attention, "asistido");
});

test("jwtExpiry lee exp", () => {
  const tok = `x.${Buffer.from(JSON.stringify({ exp: 100 })).toString("base64url")}.y`;
  assert.equal(jwtExpiry(tok), 100_000);
});
