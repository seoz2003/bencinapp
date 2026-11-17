<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api } from "../api";
import { DAYS, discountLabel } from "../lib/pricing";
import type { Discount } from "../lib/types";
import { loadDiscounts, loadMeta, store, toast } from "../store";

const token = ref(sessionStorage.getItem("bencinapp.admin") ?? "");
const authed = ref(false);
const discounts = ref<Discount[]>([]);
const reports = ref<Record<string, unknown>[]>([]);
const runs = ref<Record<string, unknown>[]>([]);
const syncing = ref(false);
const form = reactive({ cardId: "", brand: "COPEC", kind: "litro" as "litro" | "pct", value: null as number | null, days: [] as number[], conditions: "", maxLiters: null as number | null, maxAmount: null as number | null, validTo: "" });
const card = reactive({ id: "", name: "", kind: "banco" });

async function login() {
  try {
    await api.admin.ping(token.value);
    sessionStorage.setItem("bencinapp.admin", token.value);
    authed.value = true;
    await refresh();
  } catch (e) {
    toast((e as Error).message);
  }
}
async function refresh() {
  [discounts.value, reports.value, runs.value] = await Promise.all([
    api.admin.discounts(token.value), api.admin.reports(token.value), api.admin.syncRuns(token.value),
  ]);
  await loadDiscounts();
}
async function patch(d: Discount, body: Partial<Discount>) {
  await api.admin.patchDiscount(token.value, d.id, body);
  await refresh();
}
async function remove(d: Discount) {
  await api.admin.deleteDiscount(token.value, d.id);
  await refresh();
}
async function create() {
  if (!form.cardId || !form.value || !form.days.length) return toast("Completa tarjeta, valor y días");
  try {
    await api.admin.createDiscount(token.value, { ...form, maxLiters: form.maxLiters || null, maxAmount: form.maxAmount || null, validTo: form.validTo || null });
    Object.assign(form, { value: null, days: [], conditions: "", maxLiters: null, maxAmount: null, validTo: "" });
    toast("Descuento creado");
    await refresh();
  } catch (e) { toast((e as Error).message); }
}
async function addCard() {
  try {
    await api.admin.addCard(token.value, card);
    await loadMeta();
    Object.assign(card, { id: "", name: "" });
    toast("Tarjeta guardada");
  } catch (e) { toast((e as Error).message); }
}
async function sync() {
  syncing.value = true;
  try {
    const r = await api.admin.sync(token.value);
    toast(`Sincronizado con ${r.provider}: ${r.stations} estaciones, ${r.changed} cambios`);
    await Promise.all([refresh(), loadMeta()]);
  } catch (e) { toast((e as Error).message); } finally { syncing.value = false; }
}
async function resolve(id: number) {
  await api.admin.resolveReport(token.value, id);
  await refresh();
}
const toggleDay = (i: number) => (form.days = form.days.includes(i) ? form.days.filter((x) => x !== i) : [...form.days, i]);
onMounted(() => { if (token.value) login(); });
</script>

<template>
  <main class="page">
    <div v-if="!authed" class="panel grid" style="max-width: 420px; margin: 40px auto">
      <h2 style="margin: 0">Administración</h2>
      <input v-model="token" type="password" placeholder="ADMIN_TOKEN" @keyup.enter="login">
      <button class="btn" @click="login">Entrar</button>
    </div>

    <template v-else>
      <div class="sec-h">
        <h2>Sincronización de precios</h2>
        <button class="btn small" :disabled="syncing" @click="sync">{{ syncing ? "Sincronizando…" : "Sincronizar ahora" }}</button>
      </div>
      <div class="panel" style="overflow-x: auto">
        <table class="dtable">
          <thead><tr><th>Fuente</th><th>Inicio</th><th>Estaciones</th><th>Estado</th></tr></thead>
          <tbody>
            <tr v-for="r in runs.slice(0, 8)" :key="String(r.id)">
              <td>{{ r.provider }}</td><td>{{ new Date(String(r.started_at)).toLocaleString("es-CL") }}</td><td>{{ r.stations }}</td>
              <td><span v-if="r.ok" class="tag disc">OK</span><span v-else class="meta">{{ r.error ?? "en curso" }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sec-h"><h2>Nuevo descuento verificado</h2></div>
      <form class="panel grid" @submit.prevent="create">
        <div class="row2">
          <select v-model="form.cardId"><option value="" disabled>Tarjeta…</option><option v-for="c in store.meta?.cards ?? []" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          <select v-model="form.brand"><option v-for="b in (store.meta?.brands ?? []).slice(0, 30)" :key="b.key" :value="b.key">{{ b.name }}</option></select>
        </div>
        <div class="row2">
          <select v-model="form.kind"><option value="litro">$ por litro</option><option value="pct">%</option></select>
          <input v-model.number="form.value" type="number" placeholder="Valor">
        </div>
        <div class="seg"><button v-for="i in [1, 2, 3, 4, 5, 6, 0]" :key="i" type="button" class="chip" :class="{ on: form.days.includes(i) }" @click="toggleDay(i)">{{ DAYS[i] }}</button></div>
        <div class="row2">
          <input v-model.number="form.maxLiters" type="number" placeholder="Tope litros (opcional)">
          <input v-model.number="form.maxAmount" type="number" placeholder="Tope $ (opcional)">
        </div>
        <div class="row2">
          <input v-model="form.conditions" placeholder="Condiciones">
          <input v-model="form.validTo" type="date" title="Válido hasta">
        </div>
        <button class="btn" type="submit">Crear</button>
      </form>

      <div class="sec-h"><h2>Descuentos ({{ discounts.length }})</h2></div>
      <div class="panel" style="overflow-x: auto; padding: 4px 10px">
        <table class="dtable">
          <thead><tr><th>Tarjeta</th><th>Marca</th><th>Desc.</th><th>Días</th><th>Origen</th><th>Votos</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="d in discounts" :key="d.id" :style="{ opacity: d.hidden ? 0.5 : 1 }">
              <td>{{ d.cardName }}<div class="meta">{{ d.conditions }}</div></td>
              <td>{{ d.brand }}</td>
              <td class="num">{{ discountLabel(d) }}</td>
              <td>{{ d.days.map((i) => DAYS[i]).join(" ") }}</td>
              <td>{{ d.source === "admin" ? "Admin" : "Comunidad" }}<span v-if="d.sample" class="tag sample">Ejemplo</span></td>
              <td>{{ d.score }}</td>
              <td style="white-space: nowrap">
                <button class="btn small ghost" @click="patch(d, { verified: !d.verified })">{{ d.verified ? "Quitar verif." : "Verificar" }}</button>
                <button class="btn small ghost" @click="patch(d, { hidden: !d.hidden })">{{ d.hidden ? "Mostrar" : "Ocultar" }}</button>
                <button v-if="d.sample" class="btn small ghost" @click="patch(d, { sample: false })">Es real</button>
                <button class="btn small ghost" style="color: var(--bad); border-color: var(--bad)" @click="remove(d)">Borrar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sec-h"><h2>Reportes de precio pendientes ({{ reports.length }})</h2></div>
      <div class="panel" style="overflow-x: auto; padding: 4px 10px">
        <table class="dtable">
          <thead><tr><th>Estación</th><th>Comb.</th><th>Reportado</th><th>Oficial</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in reports" :key="String(r.id)">
              <td>{{ r.brand }} · {{ r.address }}, {{ r.comuna }}</td><td>{{ r.fuel }}</td><td>{{ r.price }}</td><td>{{ r.official_price ?? "—" }}</td>
              <td><button class="btn small ghost" @click="resolve(Number(r.id))">Resuelto</button></td>
            </tr>
            <tr v-if="!reports.length"><td colspan="5" class="empty">Sin reportes pendientes</td></tr>
          </tbody>
        </table>
      </div>

      <div class="sec-h"><h2>Agregar tarjeta o app</h2></div>
      <form class="panel grid" @submit.prevent="addCard">
        <div class="row2">
          <input v-model="card.id" placeholder="id (ej: coopeuch)">
          <input v-model="card.name" placeholder="Nombre visible">
        </div>
        <div class="row2">
          <select v-model="card.kind"><option value="banco">Banco</option><option value="retail">Retail</option><option value="app">App</option></select>
          <button class="btn" type="submit">Guardar</button>
        </div>
      </form>
    </template>
  </main>
</template>
