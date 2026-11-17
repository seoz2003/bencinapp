import { reactive, watch } from "vue";
import { api } from "./api";
import type { Discount, Meta } from "./lib/types";

interface Saved { fuel: string; cards: string[]; liters: number; sort: "final" | "distance" }
const KEY = "bencinapp.prefs";

function load(): Partial<Saved> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
const saved = load();

export const store = reactive({
  meta: null as Meta | null,
  discounts: [] as Discount[],
  fuel: saved.fuel ?? "93",
  cards: new Set<string>(saved.cards ?? []),
  day: new Date().getDay(),
  liters: saved.liters ?? 40,
  sort: (saved.sort ?? "final") as "final" | "distance",
  here: null as [number, number] | null,
  toast: "",
});

watch(
  () => [store.fuel, [...store.cards], store.liters, store.sort],
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ fuel: store.fuel, cards: [...store.cards], liters: store.liters, sort: store.sort }));
    } catch { /* almacenamiento no disponible */ }
  },
);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  store.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (store.toast = ""), 2600);
}

export async function loadMeta() {
  store.meta = await api.meta();
}
export async function loadDiscounts() {
  store.discounts = await api.discounts();
}
export function toggleCard(id: string) {
  const next = new Set(store.cards);
  next.has(id) ? next.delete(id) : next.add(id);
  store.cards = next;
}
