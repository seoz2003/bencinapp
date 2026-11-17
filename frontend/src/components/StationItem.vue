<script setup lang="ts">
import { brandColor, discountLabel, fmt, type Priced } from "../lib/pricing";
import { store } from "../store";

defineProps<{ s: Priced; rank: number; best: boolean; selected: boolean }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <div class="st" :class="{ best, sel: selected }" @click="$emit('select')">
    <div class="rank">{{ rank }}</div>
    <div class="body">
      <h3><span class="brandmark" :style="{ background: brandColor(s.brand) }">{{ s.brandName[0] }}</span>{{ s.brandName }}</h3>
      <div class="meta">{{ s.address }} · {{ s.comuna }}<template v-if="s.distanceKm != null"> · {{ s.distanceKm.toFixed(1) }} km</template></div>
      <div>
        <span v-if="best" class="tag best">Más barato</span>
        <span v-if="s.stale && s.updatedAt" class="tag sample">Sin actualizar desde {{ new Date(s.updatedAt.replace(" ", "T")).toLocaleDateString("es-CL") }}</span>
        <template v-if="s.discount">
          <span class="tag disc">{{ s.discount.cardName }} −{{ discountLabel(s.discount) }}</span>
          <span v-if="s.discount.sample" class="tag sample">Ejemplo</span>
          <span v-else-if="!s.discount.verified" class="tag com">Comunidad</span>
        </template>
      </div>
    </div>
    <div class="price">
      <div v-if="s.discount" class="was">{{ fmt(s.price) }}</div>
      <div class="now num">{{ fmt(s.final) }}</div>
      <div class="per">{{ fmt(s.final * store.liters) }} por {{ store.liters }} L</div>
    </div>
  </div>
</template>

<style scoped>
.st { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; cursor: pointer; }
.st.best { border: 2px solid var(--good); }
.st.sel { box-shadow: 0 0 0 3px var(--accent); }
.rank { font-family: "Space Grotesk"; font-weight: 700; color: var(--muted); width: 22px; text-align: center; }
h3 { margin: 0; font-size: 15.5px; }
.body { min-width: 0; }
.price { text-align: right; }
.now { font-size: 22px; font-weight: 700; line-height: 1; }
.was { font-size: 12px; color: var(--muted); text-decoration: line-through; }
.per { font-size: 11px; color: var(--muted); }
</style>
