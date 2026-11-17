<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { api } from "../api";
import { DAYS, fmt } from "../lib/pricing";
import type { Station } from "../lib/types";
import { loadDiscounts, store, toast } from "../store";

const d = reactive({ cardId: "", brand: "COPEC", kind: "litro" as "litro" | "pct", value: null as number | null, days: [] as number[], conditions: "", maxLiters: null as number | null });
const sending = ref(false);

function toggleDay(i: number) {
  d.days = d.days.includes(i) ? d.days.filter((x) => x !== i) : [...d.days, i];
}

async function submitDiscount() {
  if (!d.cardId || !d.value || !d.days.length) return toast("Completa tarjeta, valor y al menos un día");
  sending.value = true;
  try {
    await api.createDiscount({ ...d, maxLiters: d.maxLiters || null });
    await loadDiscounts();
    toast("Descuento publicado en Comunidad");
    Object.assign(d, { value: null, days: [], conditions: "", maxLiters: null });
  } catch (e) {
    toast((e as Error).message);
  } finally {
    sending.value = false;
  }
}

// Reporte de precio: se elige una estación cercana a la ubicación del usuario o de Concepción.
const nearby = ref<Station[]>([]);
const r = reactive({ stationId: "", fuel: "93", price: null as number | null });
onMounted(async () => {
  const [lat, lon] = store.here ?? [-36.827, -73.05];
  try {
    nearby.value = (await api.stations(r.fuel, [lon - 0.05, lat - 0.04, lon + 0.05, lat + 0.04])).sort((a, b) => a.address.localeCompare(b.address));
  } catch { /* sin conexión */ }
});

async function submitReport() {
  if (!r.stationId || !r.price) return toast("Elige estación e ingresa el precio");
  try {
    const res = await api.reportPrice({ stationId: r.stationId, fuel: r.fuel, price: r.price });
    toast(res.difference == null ? "Gracias, reporte recibido" : `Gracias. Diferencia con lo publicado: ${res.difference > 0 ? "+" : ""}${fmt(res.difference)}/L`);
    r.price = null;
  } catch (e) {
    toast((e as Error).message);
  }
}
</script>

<template>
  <main class="page">
    <div class="sec-h"><h2>Reportar un descuento</h2></div>
    <form class="panel grid" @submit.prevent="submitDiscount">
      <div class="row2">
        <div>
          <div class="lbl">Tarjeta o app</div>
          <select v-model="d.cardId" required>
            <option value="" disabled>Elige…</option>
            <option v-for="c in store.meta?.cards ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <div class="lbl">Marca de estación</div>
          <select v-model="d.brand">
            <option v-for="b in (store.meta?.brands ?? []).slice(0, 30)" :key="b.key" :value="b.key">{{ b.name }}</option>
          </select>
        </div>
      </div>
      <div class="row2">
        <div>
          <div class="lbl">Tipo</div>
          <select v-model="d.kind"><option value="litro">$ por litro</option><option value="pct">% del total</option></select>
        </div>
        <div>
          <div class="lbl">Valor</div>
          <input v-model.number="d.value" type="number" min="1" :max="d.kind === 'pct' ? 50 : 500" required :placeholder="d.kind === 'pct' ? 'Ej: 5' : 'Ej: 100'">
        </div>
      </div>
      <div>
        <div class="lbl">Días</div>
        <div class="seg"><button v-for="i in [1, 2, 3, 4, 5, 6, 0]" :key="i" type="button" class="chip" :class="{ on: d.days.includes(i) }" @click="toggleDay(i)">{{ DAYS[i] }}</button></div>
      </div>
      <div class="row2">
        <div><div class="lbl">Condición (opcional)</div><input v-model="d.conditions" maxlength="240" placeholder="Ej: pagando con la app"></div>
        <div><div class="lbl">Tope de litros (opcional)</div><input v-model.number="d.maxLiters" type="number" min="1" placeholder="Ej: 50"></div>
      </div>
      <div><button class="btn" type="submit" :disabled="sending">Publicar descuento</button></div>
    </form>

    <div class="sec-h"><h2>Reportar un precio</h2></div>
    <form class="panel grid" @submit.prevent="submitReport">
      <div class="row2">
        <div>
          <div class="lbl">Estación cercana</div>
          <select v-model="r.stationId" required>
            <option value="" disabled>Elige…</option>
            <option v-for="s in nearby" :key="s.id" :value="s.id">{{ s.brandName }} · {{ s.address }}, {{ s.comuna }}</option>
          </select>
        </div>
        <div>
          <div class="lbl">Combustible</div>
          <select v-model="r.fuel"><option v-for="f in store.meta?.fuels ?? []" :key="f.id" :value="f.id">{{ f.name }}</option></select>
        </div>
      </div>
      <div class="row2">
        <div><div class="lbl">Precio visto ($/L)</div><input v-model.number="r.price" type="number" min="100" max="5000" required></div>
        <div style="display: flex; align-items: end"><button class="btn" type="submit" style="width: 100%">Enviar</button></div>
      </div>
      <p class="meta" style="margin: 0">Los reportes sirven para detectar diferencias con lo publicado en Bencina en Línea; no reemplazan el precio oficial.</p>
    </form>
  </main>
</template>
