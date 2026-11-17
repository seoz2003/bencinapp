<script setup lang="ts">
import { computed, ref } from "vue";
import { api } from "../api";
import { brandColor, DAYS, discountLabel } from "../lib/pricing";
import { loadDiscounts, store, toast } from "../store";

const src = ref<"all" | "verified" | "community">("all");
const list = computed(() =>
  store.discounts.filter((d) => src.value === "all" || (src.value === "verified" ? d.verified : !d.verified)),
);

async function vote(id: number, value: 1 | -1) {
  const d = store.discounts.find((x) => x.id === id);
  if (!d) return;
  const next = d.myVote === value ? 0 : value;
  try {
    const r = await api.vote(id, next as -1 | 0 | 1);
    d.score = r.score;
    d.myVote = r.myVote;
    if (r.score <= -3) await loadDiscounts();
  } catch (e) {
    toast((e as Error).message);
  }
}

const condition = (d: (typeof store.discounts)[number]) =>
  [d.conditions, d.maxLiters ? `tope ${d.maxLiters} L` : "", d.maxAmount ? `tope $${d.maxAmount.toLocaleString("es-CL")}` : "", d.validTo ? `hasta ${d.validTo}` : ""]
    .filter(Boolean).join(" · ");
</script>

<template>
  <main class="page">
    <div class="sec-h">
      <h2>Descuentos vigentes</h2>
      <div class="seg">
        <button :class="{ on: src === 'all' }" @click="src = 'all'">Todos</button>
        <button :class="{ on: src === 'verified' }" @click="src = 'verified'">Verificados</button>
        <button :class="{ on: src === 'community' }" @click="src = 'community'">Comunidad</button>
      </div>
    </div>
    <div class="panel" style="padding: 4px 10px; overflow-x: auto">
      <table class="dtable">
        <thead><tr><th>Tarjeta / app</th><th>Marca</th><th>Descuento</th><th>Días</th><th class="hide-sm">Condición</th><th>Estado</th></tr></thead>
        <tbody>
          <tr v-for="d in list" :key="d.id">
            <td><b>{{ d.cardName }}</b></td>
            <td><span class="brandmark" :style="{ background: brandColor(d.brand) }">{{ (d.brandName ?? d.brand)[0] }}</span>{{ d.brandName ?? d.brand }}</td>
            <td class="num"><b>{{ discountLabel(d) }}</b></td>
            <td><div class="days"><span v-for="i in [1, 2, 3, 4, 5, 6, 0]" :key="i" :class="{ on: d.days.includes(i) }" :title="DAYS[i]">{{ DAYS[i][0] }}</span></div></td>
            <td class="hide-sm meta">{{ condition(d) }}</td>
            <td>
              <span v-if="d.sample" class="tag sample">Ejemplo</span>
              <span v-else-if="d.verified" class="tag disc">Verificado</span>
              <div v-else class="votes">
                <button :class="{ on: d.myVote === 1 }" aria-label="Funciona" @click="vote(d.id, 1)">▲</button>
                <span class="num">{{ d.score }}</span>
                <button :class="{ on: d.myVote === -1 }" aria-label="No funciona" @click="vote(d.id, -1)">▼</button>
              </div>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="6" class="empty">Sin descuentos todavía. <RouterLink to="/aportar">Aporta uno</RouterLink>.</td></tr>
        </tbody>
      </table>
    </div>
    <p class="note">Verificados: cargados por el equipo. Comunidad: aportes de usuarios que se ocultan al acumular 3 votos netos negativos. Confirma siempre las condiciones con tu banco.</p>
  </main>
</template>
