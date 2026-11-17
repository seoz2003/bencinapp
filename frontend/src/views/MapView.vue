<script setup lang="ts">
import L from "leaflet";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { api } from "../api";
import FiltersPanel from "../components/FiltersPanel.vue";
import StationItem from "../components/StationItem.vue";
import { brandColor, discountLabel, fmt, priceStations, type Priced } from "../lib/pricing";
import type { Station } from "../lib/types";
import { store, toast } from "../store";

const DEFAULT_CENTER: [number, number] = [-36.827, -73.05]; // Concepción
const MAX_LABELS = 140;

const mapEl = ref<HTMLDivElement>();
const sheetEl = ref<HTMLDivElement>();
const map = shallowRef<L.Map>();
const stations = shallowRef<Station[]>([]);
const bounds = shallowRef<L.LatLngBounds>();
const selectedId = ref<string | null>(null);
const sheetOpen = ref(false);
const filtersOpen = ref(false);
const loading = ref(false);
const isDesktop = ref(window.innerWidth >= 760);

let markers: L.LayerGroup | null = null;
let hereMarker: L.CircleMarker | null = null;
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let loadedKey = "";
const renderer = L.canvas({ padding: 0.3 });

const priced = computed(() => priceStations(stations.value, store.discounts, store.cards, store.day, store.liters, store.here));
const inView = computed(() => {
  const b = bounds.value;
  const list = b ? priced.value.filter((s) => b.contains([s.lat, s.lon])) : priced.value;
  return [...list].sort((a, b) =>
    store.sort === "distance" && a.distanceKm != null && b.distanceKm != null ? a.distanceKm - b.distanceKm : a.final - b.final,
  );
});
const best = computed(() => inView.value.reduce<Priced | null>((m, s) => (!s.stale && (!m || s.final < m.final) ? s : m), null));
const savings = computed(() => {
  if (!best.value || inView.value.length < 2) return 0;
  return (Math.max(...inView.value.filter((s) => !s.stale).map((s) => s.price)) - best.value.final) * store.liters;
});
const featured = computed(() => inView.value.find((s) => s.id === selectedId.value) ?? best.value);
const fuelName = computed(() => store.meta?.fuels.find((f) => f.id === store.fuel)?.name ?? store.fuel);

function colorsByRank(list: Priced[]) {
  const sorted = list.filter((s) => !s.stale).sort((a, b) => a.final - b.final);
  const col = new Map<string, string>();
  sorted.forEach((s, i) => {
    const t = sorted.length > 1 ? i / (sorted.length - 1) : 0;
    col.set(s.id, t < 0.34 ? "#1f8a5b" : t < 0.67 ? "#e09a12" : "#c0392b");
  });
  for (const s of list) if (s.stale) col.set(s.id, "#9aa0a6");
  return col;
}

function draw() {
  const m = map.value;
  if (!m || !markers) return;
  markers.clearLayers();
  const list = inView.value;
  const col = colorsByRank(list);
  // Etiquetas con precio sin superponerse: primero la seleccionada y luego las más baratas.
  const order = [...list].sort((a, b) => (a.id === selectedId.value ? -1 : b.id === selectedId.value ? 1 : a.final - b.final));
  const boxes: [number, number, number, number][] = [];
  const labeled = new Set<string>();
  for (const s of order) {
    if (labeled.size >= MAX_LABELS) break;
    const p = m.latLngToContainerPoint([s.lat, s.lon]);
    const w = fmt(s.final).length * 8 + 20;
    const box: [number, number, number, number] = [p.x - w / 2 - 2, p.y - 38, p.x + w / 2 + 2, p.y];
    if (boxes.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    boxes.push(box);
    labeled.add(s.id);
  }
  for (const s of list) {
    if (labeled.has(s.id)) continue;
    L.circleMarker([s.lat, s.lon], { renderer, radius: 6, color: "#fff", weight: 2, fillColor: col.get(s.id), fillOpacity: 1 })
      .on("click", () => select(s.id, "map"))
      .addTo(markers);
  }
  for (const s of order.filter((x) => labeled.has(x.id)).reverse()) {
    const c = col.get(s.id);
    const html = `<div class="pin-label ${s.id === selectedId.value ? "sel" : ""}">
        <div class="box" style="background:${c}">${fmt(s.final)}${s.discount ? '<span class="pct">%</span>' : ""}</div>
        <div class="tip" style="border-top-color:${c}"></div></div>`;
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: "pin", html, iconSize: [0, 0], iconAnchor: [0, 0] }), zIndexOffset: s.id === selectedId.value ? 1000 : 0 })
      .on("click", () => select(s.id, "map"))
      .addTo(markers);
  }
}

async function loadStations(force = false) {
  const m = map.value;
  if (!m) return;
  bounds.value = m.getBounds();
  const wide = m.getBounds().pad(0.4);
  const key = `${store.fuel}|${wide.toBBoxString()}`;
  // Evita pedir de nuevo si la vista actual está dentro del área ya cargada.
  if (!force && loadedKey.startsWith(store.fuel + "|")) {
    const [w, s, e, n] = loadedKey.split("|")[1].split(",").map(Number);
    if (L.latLngBounds([s, w], [n, e]).contains(m.getBounds())) return draw();
  }
  loading.value = true;
  try {
    stations.value = await api.stations(store.fuel, [wide.getWest(), wide.getSouth(), wide.getEast(), wide.getNorth()]);
    loadedKey = key;
  } catch {
    toast("No se pudieron cargar las estaciones");
  } finally {
    loading.value = false;
  }
}

function onMove() {
  bounds.value = map.value?.getBounds();
  draw();
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(() => loadStations(), 250);
}

/** Centra un punto considerando lo que tapan la hoja inferior (móvil) o el panel lateral (escritorio). */
function centerOn(lat: number, lon: number, zoom?: number) {
  const m = map.value!;
  m.setView([lat, lon], zoom ?? Math.max(m.getZoom(), 14), { animate: false });
  if (isDesktop.value) m.panBy([-197, 0], { animate: false });
  else m.panBy([0, (sheetEl.value?.offsetHeight ?? 110) / 2 - 30], { animate: false });
}

function select(id: string, from: "map" | "list") {
  selectedId.value = from === "map" && selectedId.value === id ? null : id;
  if (from === "list") {
    const s = inView.value.find((x) => x.id === id);
    if (!isDesktop.value) sheetOpen.value = false;
    if (s) centerOn(s.lat, s.lon);
  } else if (selectedId.value) {
    document.querySelector(`[data-st="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  draw();
}

function locate(silent = false) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      store.here = [pos.coords.latitude, pos.coords.longitude];
      hereMarker?.remove();
      hereMarker = L.circleMarker(store.here, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(map.value!);
      centerOn(store.here[0], store.here[1], 14);
    },
    () => { if (!silent) toast("No pudimos obtener tu ubicación"); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
  );
}

const directionsUrl = (s: Priced) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;

function onResize() { isDesktop.value = window.innerWidth >= 760; map.value?.invalidateSize(); }

onMounted(() => {
  const m = L.map(mapEl.value!, { zoomControl: false, attributionControl: true }).setView(DEFAULT_CENTER, 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Precios: CNE',
  }).addTo(m);
  markers = L.layerGroup().addTo(m);
  m.on("moveend zoomend", onMove);
  m.on("click", () => { if (selectedId.value) { selectedId.value = null; draw(); } });
  map.value = m;
  loadStations(true);
  locate(true);
  window.addEventListener("resize", onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  clearTimeout(fetchTimer);
  map.value?.remove();
});

watch(() => store.fuel, () => { selectedId.value = null; loadStations(true); });
watch(() => [store.cards, store.day, store.liters, store.discounts, store.sort], () => draw(), { deep: true });
watch(stations, () => draw());
</script>

<template>
  <section class="mapview">
    <div ref="mapEl" class="map"></div>

    <div class="topbar">
      <div class="seg fuels">
        <button v-for="f in store.meta?.fuels ?? []" :key="f.id" :class="{ on: store.fuel === f.id }" @click="store.fuel = f.id">{{ f.name }}</button>
      </div>
      <button class="roundbtn" aria-label="Mi ubicación" @click="locate()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
      </button>
      <button class="roundbtn" aria-label="Filtros" @click="filtersOpen = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        <span v-if="store.cards.size" class="badge">{{ store.cards.size }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading">Cargando…</div>

    <div ref="sheetEl" class="sheet" :class="{ open: sheetOpen }">
      <div v-if="!isDesktop" class="handle" @click="sheetOpen = !sheetOpen"></div>

      <div v-if="isDesktop" class="summary">
        <div class="lbl2">{{ inView.length }} estaciones · {{ fuelName }}</div>
        <div v-if="best && savings > 0" class="meta">Cargando {{ store.liters }} L en {{ best.brandName }} {{ best.comuna }} ahorras <b class="good">{{ fmt(savings) }}</b> vs. la más cara</div>
        <div v-if="!store.cards.size" class="meta">Elige tus tarjetas en <a href="#" @click.prevent="filtersOpen = true">filtros</a> para ver tu precio con descuento.</div>
      </div>
      <div v-else-if="featured" class="pop" @click="sheetOpen = !sheetOpen">
        <span class="brandmark big" :style="{ background: brandColor(featured.brand) }">{{ featured.brandName[0] }}</span>
        <div class="pop-body">
          <div v-if="featured.id === best?.id" class="lbl2">Más barato en el mapa</div>
          <b>{{ featured.brandName }} · {{ featured.address }}</b>
          <div class="meta">
            <span v-if="featured.discount" class="good strong">{{ featured.discount.cardName }} −{{ discountLabel(featured.discount) }} · </span>{{ featured.comuna }}<template v-if="featured.distanceKm != null"> · {{ featured.distanceKm.toFixed(1) }} km</template>
          </div>
          <div class="more">
            <template v-if="sheetOpen">Ocultar lista</template>
            <template v-else>Ver las {{ inView.length }} estaciones<template v-if="featured.id === best?.id && savings > 0"> · ahorras {{ fmt(savings) }}</template></template>
            · <a :href="directionsUrl(featured)" target="_blank" rel="noopener" @click.stop>Cómo llegar</a>
          </div>
        </div>
        <div class="pop-price">
          <div class="num">{{ fmt(featured.final) }}</div>
          <div v-if="featured.discount" class="was">{{ fmt(featured.price) }}</div>
        </div>
      </div>
      <div v-else class="meta" style="padding: 6px 2px">No hay estaciones con {{ fuelName }} en esta zona. Aleja el mapa.</div>

      <div class="list">
        <StationItem
          v-for="(s, i) in inView.slice(0, 200)" :key="s.id" :data-st="s.id" :s="s" :rank="i + 1"
          :best="s.id === best?.id" :selected="s.id === selectedId" @select="select(s.id, 'list')"
        />
        <p class="note">
          Precio final: pizarra menos el mejor descuento de tus tarjetas para el día elegido.
          Fuente de precios: CNE<template v-if="store.meta?.lastSync">, actualizado {{ new Date(store.meta.lastSync.finishedAt).toLocaleString("es-CL") }}</template>.
        </p>
      </div>
    </div>

    <FiltersPanel v-if="filtersOpen" @close="filtersOpen = false" @goto="(lat, lon) => centerOn(lat, lon, 14)" />
  </section>
</template>

<style scoped>
.mapview { position: relative; height: calc(100vh - var(--header-h)); height: calc(100dvh - var(--header-h)); overflow: hidden; }
.map { position: absolute; inset: 0; }
.topbar { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 8px; align-items: center; z-index: 1000; pointer-events: none; }
.topbar > * { pointer-events: auto; }
.fuels { flex-wrap: nowrap; overflow-x: auto; background: rgba(255, 253, 248, .96); border-radius: 99px; padding: 4px; gap: 2px; box-shadow: 0 2px 10px rgba(0, 0, 0, .14); scrollbar-width: none; margin-right: auto; }
.fuels::-webkit-scrollbar { display: none; }
.fuels button { border: 0; background: transparent; padding: 7px 13px; white-space: nowrap; }
.roundbtn { flex: none; height: 40px; min-width: 40px; padding: 0 11px; border: 0; border-radius: 99px; background: rgba(255, 253, 248, .96); box-shadow: 0 2px 10px rgba(0, 0, 0, .14); display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600; font-size: 13px; }
.badge { background: var(--accent); color: var(--accent-ink); border-radius: 99px; padding: 1px 7px; font-size: 12px; }
.loading { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; font-size: 12px; padding: 4px 10px; border-radius: 99px; z-index: 1000; }
.sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 1000; background: var(--card); border-radius: 18px 18px 0 0; box-shadow: 0 -4px 20px rgba(0, 0, 0, .16); padding: 6px 12px 10px; max-height: 62%; display: flex; flex-direction: column; }
.sheet.open { max-height: 74%; }
.handle { width: 42px; height: 5px; border-radius: 9px; background: #d4cdbd; margin: 2px auto 8px; cursor: pointer; flex: none; position: relative; }
.handle::before { content: ""; position: absolute; inset: -12px -30px; }
.list { display: none; overflow-y: auto; gap: 8px; margin-top: 10px; overscroll-behavior: contain; }
.sheet.open .list { display: grid; }
.pop { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.pop-body { min-width: 0; flex: 1; }
.pop-body b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pop-price { text-align: right; flex: none; }
.pop-price .num { font-size: 22px; font-weight: 700; }
.was { font-size: 12px; color: var(--muted); text-decoration: line-through; }
.brandmark.big { width: 32px; height: 32px; font-size: 14px; }
.lbl2 { font-size: 11px; font-weight: 700; color: var(--good); text-transform: uppercase; letter-spacing: .5px; }
.more { font-size: 12.5px; color: var(--brand); font-weight: 600; margin-top: 2px; }
.good { color: var(--good); }
.strong { font-weight: 600; }
.summary { padding: 6px 4px 2px; }
@media (min-width: 760px) {
  .sheet { left: 12px; right: auto; top: 62px; bottom: 12px; width: 370px; border-radius: 16px; max-height: none; }
  .sheet .list { display: grid; }
  .topbar { left: 394px; }
}
</style>
