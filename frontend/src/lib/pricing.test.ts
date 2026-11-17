import { describe, expect, it } from "vitest";
import { bestDiscount, discountAmount, haversineKm } from "./pricing";
import type { Discount, Station } from "./types";

const st: Station = { id: "1", brand: "COPEC", brandName: "Copec", address: "", comuna: "", region: "", lat: 0, lon: 0, price: 1500, attention: null, updatedAt: null };
const d = (o: Partial<Discount>): Discount => ({
  id: 1, cardId: "bancochile", cardName: "", brand: "COPEC", kind: "litro", value: 100, days: [3], conditions: "",
  maxLiters: null, maxAmount: null, validFrom: null, validTo: null, source: "admin", verified: true, hidden: false,
  sample: false, score: 0, createdAt: "", ...o,
});

describe("pricing", () => {
  it("aplica tope de litros", () => {
    expect(discountAmount(d({ maxLiters: 20 }), 1500, 40)).toBe(2000);
  });
  it("aplica tope de monto en porcentaje", () => {
    expect(discountAmount(d({ kind: "pct", value: 10, maxAmount: 3000 }), 1500, 40)).toBe(3000);
  });
  it("elige el mejor descuento según tarjeta y día", () => {
    const list = [d({ id: 1, value: 50 }), d({ id: 2, value: 120 }), d({ id: 3, value: 300, cardId: "otra" }), d({ id: 4, value: 400, days: [1] })];
    const r = bestDiscount(st, list, new Set(["bancochile"]), 3, 40);
    expect(r.discount?.id).toBe(2);
    expect(r.perLiter).toBe(120);
  });
  it("distancia Concepción–Talcahuano aprox. 13 km", () => {
    expect(haversineKm([-36.827, -73.05], [-36.725, -73.115])).toBeGreaterThan(11);
  });
});
