const DISPLAY: Record<string, string> = {
  COPEC: "Copec", SHELL: "Shell", ARAMCO: "Aramco", "SIN BANDERA": "Sin bandera", JLC: "JLC",
  TERPEL: "Terpel", GULF: "Gulf", ABASTIBLE: "Abastible", HN: "HN", PETROBRAS: "Petrobras",
};

/** Clave estable de marca, usada para cruzar estaciones con descuentos. */
export function brandKey(raw: string | null | undefined): string {
  const k = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!k || k === "SIN BANDERA" || k === "SIN MARCA") return "SIN BANDERA";
  if (k.startsWith("PETROBRAS")) return "ARAMCO"; // Petrobras Chile pasó a operar como Aramco
  return k;
}

export function brandName(key: string): string {
  return DISPLAY[key] ?? key.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}
