import { nowIso, tx, type DB } from "./db.js";

export const DEFAULT_CARDS: [string, string, string][] = [
  ["bancochile", "Banco de Chile", "banco"], ["santander", "Santander", "banco"], ["bci", "BCI", "banco"],
  ["bancoestado", "BancoEstado", "banco"], ["scotiabank", "Scotiabank", "banco"], ["itau", "Itaú", "banco"],
  ["security", "Banco Security", "banco"], ["falabella", "Banco Falabella / CMR", "retail"],
  ["ripley", "Banco Ripley", "retail"], ["lider", "Líder BCI", "retail"], ["tenpo", "Tenpo", "app"],
  ["mach", "MACH", "app"], ["mercadopago", "Mercado Pago", "app"], ["muevo", "App Muevo (Copec)", "app"],
  ["shellbox", "Shell Box", "app"], ["aramcoapp", "App Aramco", "app"],
];

/**
 * Descuentos de ejemplo para que la interfaz no parta vacía. Están marcados como sample=1
 * y la interfaz los muestra como "Ejemplo": reemplázalos desde el panel de administración
 * con los convenios vigentes de cada banco.
 */
const SAMPLE_DISCOUNTS: [string, string, "litro" | "pct", number, number[], string][] = [
  ["bancochile", "COPEC", "litro", 100, [3], "Ejemplo. Pagando en App Muevo"],
  ["santander", "SHELL", "litro", 100, [1], "Ejemplo. Pagando con Shell Box"],
  ["bci", "ARAMCO", "litro", 80, [5], "Ejemplo. Tarjeta de crédito"],
  ["bancoestado", "COPEC", "litro", 50, [2], "Ejemplo. Vía App Muevo"],
  ["muevo", "COPEC", "litro", 20, [0, 1, 2, 3, 4, 5, 6], "Ejemplo. Acumulando en la app"],
  ["shellbox", "SHELL", "litro", 15, [0, 1, 2, 3, 4, 5, 6], "Ejemplo. Pagando con la app"],
];

export function seedReferenceData(db: DB) {
  const nCards = (db.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number }).n;
  if (nCards > 0) return;
  tx(db, () => {
    const ins = db.prepare("INSERT INTO cards (id, name, kind, sort) VALUES (?, ?, ?, ?)");
    DEFAULT_CARDS.forEach(([id, name, kind], i) => ins.run(id, name, kind, i));
    const insD = db.prepare(`INSERT INTO discounts (card_id, brand, kind, value, days, conditions, max_liters, source, verified, sample, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 50, 'admin', 1, 1, ?)`);
    for (const [card, brand, kind, value, days, cond] of SAMPLE_DISCOUNTS) insD.run(card, brand, kind, value, days.join(","), cond, nowIso());
  });
}
