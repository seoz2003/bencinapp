export interface Fuel { id: string; name: string }
export interface Card { id: string; name: string; kind: "banco" | "retail" | "app" }
export interface Brand { key: string; name: string; stations: number }
export interface Meta {
  fuels: Fuel[]; cards: Card[]; brands: Brand[]; stations: number;
  lastSync: { provider: string; finishedAt: string; stations: number } | null;
}
export interface Station {
  id: string; brand: string; brandName: string; address: string; comuna: string; region: string;
  lat: number; lon: number; price: number; attention: string | null; updatedAt: string | null;
}
export interface Discount {
  id: number; cardId: string; cardName: string; brand: string; brandName?: string; kind: "litro" | "pct"; value: number;
  days: number[]; conditions: string; maxLiters: number | null; maxAmount: number | null;
  validFrom: string | null; validTo: string | null; source: "admin" | "community"; verified: boolean;
  hidden: boolean; sample: boolean; score: number; myVote?: number; createdAt: string;
}
export interface Comuna { comuna: string; region: string; lat: number; lon: number; stations: number }
