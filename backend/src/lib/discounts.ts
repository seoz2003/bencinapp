export interface DiscountRow {
  id: number; card_id: string; brand: string; kind: "litro" | "pct"; value: number; days: string;
  conditions: string; max_liters: number | null; max_amount: number | null; valid_from: string | null;
  valid_to: string | null; source: "admin" | "community"; verified: number; hidden: number; sample: number;
  score: number; created_at: string;
}

export const HIDE_SCORE = -3;

/** Un descuento se muestra si no está oculto, está vigente y (es verificado o la comunidad no lo rechazó). */
export function isVisible(d: DiscountRow, today = new Date().toISOString().slice(0, 10)): boolean {
  if (d.hidden) return false;
  if (d.valid_from && today < d.valid_from) return false;
  if (d.valid_to && today > d.valid_to) return false;
  return Boolean(d.verified) || d.score > HIDE_SCORE;
}

export function toApi(d: DiscountRow, cardName?: string) {
  return {
    id: d.id, cardId: d.card_id, cardName: cardName ?? d.card_id, brand: d.brand, kind: d.kind, value: d.value,
    days: d.days.split(",").filter(Boolean).map(Number), conditions: d.conditions,
    maxLiters: d.max_liters, maxAmount: d.max_amount, validFrom: d.valid_from, validTo: d.valid_to,
    source: d.source, verified: Boolean(d.verified), hidden: Boolean(d.hidden), sample: Boolean(d.sample),
    score: d.score, createdAt: d.created_at,
  };
}
