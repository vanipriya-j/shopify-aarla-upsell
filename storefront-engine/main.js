import { initAarlaPromotions } from "./storefront.js";

function boot() {
  try {
    initAarlaPromotions(window);
  } catch (error) {
    // Never block storefront rendering.
    // eslint-disable-next-line no-console
    console.error("[Aarla Promotions] failed to initialize", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
