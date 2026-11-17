<script setup lang="ts">
import { onMounted } from "vue";
import { loadDiscounts, loadMeta, store, toast } from "./store";

onMounted(async () => {
  try {
    await Promise.all([loadMeta(), loadDiscounts()]);
  } catch {
    toast("No se pudo conectar con el servidor");
  }
});
</script>

<template>
  <header class="app-header">
    <div class="hrow">
      <div class="logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f2a3d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M15 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3"/><rect x="7" y="6" width="5" height="4"/></svg>
      </div>
      <h1>Bencinapp</h1>
      <nav>
        <RouterLink to="/">Mapa</RouterLink>
        <RouterLink to="/descuentos">Descuentos</RouterLink>
        <RouterLink to="/aportar">Aportar</RouterLink>
      </nav>
    </div>
  </header>
  <RouterView />
  <div v-if="store.toast" class="toast">{{ store.toast }}</div>
</template>
