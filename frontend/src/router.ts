import { createRouter, createWebHistory } from "vue-router";
import MapView from "./views/MapView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "mapa", component: MapView },
    { path: "/descuentos", name: "descuentos", component: () => import("./views/DiscountsView.vue") },
    { path: "/aportar", name: "aportar", component: () => import("./views/ContributeView.vue") },
    { path: "/admin", name: "admin", component: () => import("./views/AdminView.vue") },
  ],
});
