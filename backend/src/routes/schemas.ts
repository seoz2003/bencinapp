import { z } from "zod";
import { FUELS } from "../lib/fuels.js";

export const fuelEnum = z.enum(FUELS.map((f) => f.id) as [string, ...string[]]);
const day = z.number().int().min(0).max(6);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const discountInput = z.object({
  cardId: z.string().min(1).max(40),
  brand: z.string().min(1).max(60).transform((s) => s.trim().toUpperCase()),
  kind: z.enum(["litro", "pct"]),
  value: z.number().positive(),
  days: z.array(day).min(1).max(7),
  conditions: z.string().max(240).default(""),
  maxLiters: z.number().positive().max(1000).nullable().optional(),
  maxAmount: z.number().positive().max(1_000_000).nullable().optional(),
  validFrom: isoDate.nullable().optional(),
  validTo: isoDate.nullable().optional(),
}).refine((d) => (d.kind === "pct" ? d.value <= 50 : d.value <= 500), { message: "Valor de descuento fuera de rango", path: ["value"] });

export const adminDiscountPatch = z.object({
  cardId: z.string().min(1).max(40).optional(),
  brand: z.string().min(1).max(60).transform((s) => s.trim().toUpperCase()).optional(),
  kind: z.enum(["litro", "pct"]).optional(),
  value: z.number().positive().optional(),
  days: z.array(day).min(1).max(7).optional(),
  conditions: z.string().max(240).optional(),
  maxLiters: z.number().positive().nullable().optional(),
  maxAmount: z.number().positive().nullable().optional(),
  validFrom: isoDate.nullable().optional(),
  validTo: isoDate.nullable().optional(),
  verified: z.boolean().optional(),
  hidden: z.boolean().optional(),
  sample: z.boolean().optional(),
});

export const voteInput = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });
export const priceReportInput = z.object({ stationId: z.string().min(1).max(60), fuel: fuelEnum, price: z.number().min(100).max(5000) });
export const voterId = z.string().regex(/^[a-zA-Z0-9-]{8,64}$/);
