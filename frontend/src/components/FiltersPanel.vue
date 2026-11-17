<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { DAYS_LONG } from "../lib/pricing";
import type { Comuna } from "../lib/types";
import { store, toggleCard } from "../store";

const emit = defineEmits<{ close: []; goto: [lat: number, lon: number] }>();
const comunas = ref<Comuna[]>([]);
const comunaQ = ref("");
const today = new Date().getDay();

onMounted(async () => {
  try { comunas.value = await api.comunas(); } catch { /* sin conexión */ }
});

function pickComuna() {
  const c = comunas.value.find((x) => x.comuna.toLowerCase() === comunaQ.value.trim().toLowerCase());
  if (c) { emit("goto", c.lat, c.lon); emit("close"); }
}
</script>

<template>
  <div class="filtpanel" @click.self="emit('close')">
    <div class="sheetbox">
      <div class="fp-h"><b>Filtros</b><button class="x" aria-label="Cerrar" @click="emit('close')">×</button></div>
      <div class="grid">
        <div>
          <div class="lbl">Mis tarjetas y apps</div>
          <div class="seg">
            <button v-for="c in store.meta?.cards ?? []" :key="c.id" class="chip" :class="{ on: store.cards.has(c.id) }" @click="toggleCard(c.id)">{{ c.name }}</button>
          </div>
        </div>
        <div>
          <div class="lbl">Ir a comuna</div>
          <input v-model="comunaQ" list="comunas-list" placeholder="Ej: Concepción" @change="pickComuna" @keyup.enter="pickComuna">
          <datalist id="comunas-list">
            <option v-for="c in comunas" :key="c.comuna + c.region" :value="c.comuna">{{ c.region }}</option>
          </datalist>
        </div>
        <div class="row2">
          <div>
            <div class="lbl">Día de carga</div>
            <select v-model.number="store.day">
              <option v-for="(d, i) in DAYS_LONG" :key="i" :value="i">{{ d }}{{ i === today ? " (hoy)" : "" }}</option>
            </select>
          </div>
          <div>
            <div class="lbl">Litros</div>
            <input v-model.number="store.liters" type="number" min="5" max="200">
          </div>
        </div>
        <div>
          <div class="lbl">Ordenar por</div>
          <div class="seg">
            <button :class="{ on: store.sort === 'final' }" @click="store.sort = 'final'">Precio final</button>
            <button :class="{ on: store.sort === 'distance' }" :disabled="!store.here" @click="store.sort = 'distance'">Cercanía</button>
          </div>
        </div>
        <button class="btn" style="width: 100%" @click="emit('close')">Ver resultados</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filtpanel { position: absolute; inset: 0; background: rgba(15, 42, 61, .35); display: flex; align-items: flex-end; justify-content: center; z-index: 1200; }
.sheetbox { background: var(--card); width: 100%; max-width: 520px; border-radius: 18px 18px 0 0; padding: 14px 16px 20px; max-height: 85%; overflow-y: auto; }
.fp-h { display: flex; align-items: center; margin-bottom: 8px; }
.x { margin-left: auto; border: 0; background: none; font-size: 24px; color: var(--muted); }
@media (min-width: 760px) { .filtpanel { align-items: center; } .sheetbox { border-radius: 16px; } }
</style>
