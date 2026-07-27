import {
  activatePromotion,
  buildDiscountUrl,
  clearActivePromotion,
  hasDiscountCode,
  isPromotionExpired,
  readUtmParams,
  resolveActivePromotion,
  selectPromotion,
  shouldSuppressPopup,
} from "./engine.js";
import {
  createMemoryStorage,
  ensureVisitorState,
  readVisitorState,
  writeVisitorState,
} from "./storage.js";

const ROOT_ID = "aarla-promo-root";
const CONFIG_SELECTOR = "[data-aarla-promotions-config]";

/**
 * @param {Document} document
 * @returns {import('./engine.js').AppConfig | null}
 */
export function loadConfigFromDocument(document) {
  const nodes = Array.from(document.querySelectorAll(CONFIG_SELECTOR));
  if (!nodes.length) return null;

  /** @type {Partial<import('./engine.js').GlobalConfig>} */
  let global = {};
  /** @type {import('./engine.js').PromotionConfig[]} */
  const promotions = [];
  /** @type {Record<string, string>} */
  let i18n = {};

  for (const node of nodes) {
    try {
      const parsed = JSON.parse(node.textContent || "{}");
      if (parsed.global) global = { ...global, ...parsed.global };
      if (Array.isArray(parsed.promotions)) {
        for (const promo of parsed.promotions) {
          if (!promo || !promo.key) continue;
          const index = promotions.findIndex((item) => item.key === promo.key);
          if (index >= 0)
            promotions[index] = { ...promotions[index], ...promo };
          else promotions.push(promo);
        }
      }
      if (parsed.i18n) i18n = { ...i18n, ...parsed.i18n };
    } catch {
      // Ignore malformed merchant/config JSON fragments.
    }
  }

  if (!promotions.some((promo) => promo.key === "welcome")) {
    // Welcome config lives on the main embed; if missing, continue with campaigns only.
  }

  return {
    global: {
      enabled: Boolean(global.enabled),
      testMode: Boolean(global.testMode),
      testPreview: normalizePreview(global.testPreview),
      popupDelayMs: Number(global.popupDelayMs) || 0,
      popupPosition: normalizePosition(global.popupPosition),
      popupMaxWidth: Number(global.popupMaxWidth) || 420,
      overlayOpacity: clamp(Number(global.overlayOpacity) || 0.45, 0, 1),
      borderRadius: Number.isFinite(Number(global.borderRadius))
        ? Number(global.borderRadius)
        : 12,
      showReminderBadge: Boolean(global.showReminderBadge),
      debugLogging: Boolean(global.debugLogging),
    },
    promotions,
    i18n,
  };
}

/**
 * @param {unknown} value
 * @returns {'automatic' | import('./engine.js').PromotionKey}
 */
function normalizePreview(value) {
  if (
    value === "welcome" ||
    value === "campaign_a" ||
    value === "campaign_b" ||
    value === "automatic"
  ) {
    return value;
  }
  return "automatic";
}

/**
 * @param {unknown} value
 * @returns {'center' | 'bottom-left' | 'bottom-right'}
 */
function normalizePosition(value) {
  if (
    value === "bottom-left" ||
    value === "bottom-right" ||
    value === "center"
  ) {
    return value;
  }
  return "center";
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Core orchestration used by the storefront and unit tests.
 * @param {object} input
 * @param {import('./engine.js').AppConfig} input.config
 * @param {Storage | null} input.liveStorage
 * @param {string} input.search
 * @param {string} input.pathname
 * @param {number} [input.now]
 * @param {Storage} [input.testStorage]
 */
export function evaluatePromotionsForVisit({
  config,
  liveStorage,
  search,
  pathname,
  now = Date.now(),
  testStorage,
}) {
  const testMode = Boolean(config.global.testMode);
  const storage = testMode ? testStorage || createMemoryStorage() : liveStorage;

  // Snapshot live state before test-mode work so callers can assert it is unchanged.
  const liveSnapshot = liveStorage ? readVisitorState(liveStorage) : null;

  const utm = readUtmParams(search);
  let isFirstVisit = false;
  /** @type {import('./engine.js').VisitorState} */
  let state;

  if (testMode) {
    // Ignore normal first-visit suppression while previewing.
    const ensured = ensureVisitorState(storage, now);
    state = ensured.state;
    isFirstVisit = true;
  } else {
    const existing = readVisitorState(storage);
    isFirstVisit = existing == null;
    const ensured = ensureVisitorState(storage, now);
    state = ensured.state;
  }

  if (isPromotionExpired(state, now)) {
    state = clearActivePromotion(state);
    writeVisitorState(storage, state);
  }

  /** @type {import('./engine.js').PromotionConfig | null} */
  let candidate = null;

  if (testMode && config.global.testPreview !== "automatic") {
    candidate =
      config.promotions.find(
        (promo) => promo.enabled && promo.key === config.global.testPreview,
      ) || null;
  } else {
    candidate = selectPromotion({
      promotions: config.promotions,
      utm,
      currentPath: pathname,
      isFirstTimeVisitor:
        isFirstVisit || (testMode && config.global.testPreview === "automatic"),
    });
  }

  const resolution = resolveActivePromotion({
    candidate,
    state,
    promotions: config.promotions,
    now,
  });

  if (resolution.action === "clear") {
    state = clearActivePromotion(state);
  } else if (
    (resolution.action === "activate" || resolution.action === "replace") &&
    resolution.promotion
  ) {
    state = activatePromotion(state, resolution.promotion, now);
  }

  writeVisitorState(storage, state);

  const activePromotion = state.activePromotionKey
    ? config.promotions.find(
        (promo) => promo.key === state.activePromotionKey,
      ) || null
    : null;

  const suppressPopup = activePromotion
    ? shouldSuppressPopup(state, activePromotion, now) && !testMode
    : true;

  return {
    testMode,
    storage,
    state,
    activePromotion,
    suppressPopup,
    liveSnapshot,
    discountUrl:
      activePromotion && hasDiscountCode(activePromotion.discountCode)
        ? buildDiscountUrl(
            activePromotion.discountCode,
            activePromotion.ctaDestination || "/",
          )
        : null,
  };
}

/**
 * @param {Window & typeof globalThis} window
 */
export function initAarlaPromotions(window) {
  const document = window.document;
  const config = loadConfigFromDocument(document);
  if (!config || !config.global.enabled) return null;

  const log = (...args) => {
    if (config.global.debugLogging) {
      // eslint-disable-next-line no-console
      console.info("[Aarla Promotions]", ...args);
    }
  };

  const evaluation = evaluatePromotionsForVisit({
    config,
    liveStorage: window.localStorage,
    search: window.location.search,
    pathname: window.location.pathname,
  });

  log("evaluation", {
    active: evaluation.activePromotion?.key || null,
    suppressPopup: evaluation.suppressPopup,
    testMode: evaluation.testMode,
  });

  const controller = createUiController({
    window,
    document,
    config,
    evaluation,
    log,
  });

  controller.mount();
  return controller;
}

/**
 * @param {object} ctx
 * @param {Window & typeof globalThis} ctx.window
 * @param {Document} ctx.document
 * @param {import('./engine.js').AppConfig} ctx.config
 * @param {ReturnType<typeof evaluatePromotionsForVisit>} ctx.evaluation
 * @param {(...args: unknown[]) => void} ctx.log
 */
function createUiController({ window, document, config, evaluation, log }) {
  /** @type {HTMLElement | null} */
  let root = null;
  /** @type {HTMLElement | null} */
  let dialog = null;
  /** @type {HTMLElement | null} */
  let badge = null;
  /** @type {Element | null} */
  let previouslyFocused = null;
  /** @type {number | null} */
  let openTimer = null;
  let isOpen = false;

  const reducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function persist() {
    writeVisitorState(evaluation.storage, evaluation.state);
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "aarla-promo-root";
    root.dataset.position = config.global.popupPosition;
    root.style.setProperty(
      "--aarla-promo-max-width",
      `${config.global.popupMaxWidth}px`,
    );
    root.style.setProperty(
      "--aarla-promo-overlay-opacity",
      String(config.global.overlayOpacity),
    );
    root.style.setProperty(
      "--aarla-promo-radius",
      `${config.global.borderRadius}px`,
    );
    if (reducedMotion) root.classList.add("aarla-promo-root--reduced-motion");
    document.body.appendChild(root);

    if (!evaluation.activePromotion) {
      log("no active promotion");
      return;
    }

    renderBadge();
    if (!evaluation.suppressPopup) {
      const delay = Math.max(0, config.global.popupDelayMs || 0);
      openTimer = window.setTimeout(() => openPopup(), delay);
    } else if (
      config.global.showReminderBadge &&
      !evaluation.state.badgeDismissed
    ) {
      showBadge();
    }
  }

  function renderBadge() {
    if (!root || !evaluation.activePromotion) return;
    if (badge) badge.remove();

    const promo = evaluation.activePromotion;
    const label = hasDiscountCode(promo.discountCode)
      ? (config.i18n?.reminder_with_code || "{{ code }} is active").replace(
          "{{ code }}",
          String(promo.discountCode).trim(),
        )
      : config.i18n?.reminder_without_code || "Your Aarla offer is active";

    badge = document.createElement("div");
    badge.className = "aarla-promo-badge";
    badge.hidden = true;
    badge.innerHTML = `
      <button type="button" class="aarla-promo-badge__open">${escapeHtml(label)}</button>
      <button type="button" class="aarla-promo-badge__dismiss" aria-label="${escapeHtml(
        config.i18n?.dismiss_reminder || "Dismiss offer reminder",
      )}">×</button>
    `;
    badge
      .querySelector(".aarla-promo-badge__open")
      ?.addEventListener("click", () => openPopup({ fromBadge: true }));
    badge
      .querySelector(".aarla-promo-badge__dismiss")
      ?.addEventListener("click", () => {
        evaluation.state.badgeDismissed = true;
        persist();
        hideBadge();
      });
    root.appendChild(badge);
  }

  function showBadge() {
    if (!badge || !config.global.showReminderBadge) return;
    if (evaluation.state.badgeDismissed) return;
    if (isPromotionExpired(evaluation.state)) {
      hideBadge();
      return;
    }
    badge.hidden = false;
  }

  function hideBadge() {
    if (badge) badge.hidden = true;
  }

  /**
   * @param {{ fromBadge?: boolean }} [_options]
   */
  function openPopup(_options = {}) {
    if (!root || !evaluation.activePromotion || isOpen) return;

    const promo = evaluation.activePromotion;
    previouslyFocused = document.activeElement;
    hideBadge();

    const code = hasDiscountCode(promo.discountCode)
      ? String(promo.discountCode).trim()
      : "";
    const ctaHref = code
      ? buildDiscountUrl(code, promo.ctaDestination || "/")
      : promo.ctaDestination || "/";
    const ctaLabel = code
      ? promo.ctaText || config.i18n?.apply_and_shop || "Apply and shop"
      : promo.ctaText || "Shop";

    const overlay = document.createElement("div");
    overlay.className = "aarla-promo-overlay";
    overlay.tabIndex = -1;

    dialog = document.createElement("div");
    dialog.className = "aarla-promo-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "aarla-promo-title");

    dialog.innerHTML = `
      <button type="button" class="aarla-promo-dialog__close" aria-label="${escapeHtml(
        config.i18n?.close || "Close",
      )}">×</button>
      ${
        evaluation.testMode
          ? `<p class="aarla-promo-dialog__test">${escapeHtml(
              config.i18n?.test_mode_label || "Test mode",
            )}</p>`
          : ""
      }
      <h2 id="aarla-promo-title" class="aarla-promo-dialog__title">${escapeHtml(
        promo.headline || "",
      )}</h2>
      <p class="aarla-promo-dialog__message">${escapeHtml(promo.message || "")}</p>
      ${
        code
          ? `<div class="aarla-promo-dialog__code-row">
              <code class="aarla-promo-dialog__code" data-aarla-code>${escapeHtml(code)}</code>
              <button type="button" class="aarla-promo-dialog__copy">${escapeHtml(
                config.i18n?.copy_code || "Copy code",
              )}</button>
            </div>`
          : ""
      }
      <a class="aarla-promo-dialog__cta" href="${escapeAttribute(ctaHref)}">${escapeHtml(
        ctaLabel,
      )}</a>
    `;

    overlay.appendChild(dialog);
    root.appendChild(overlay);
    isOpen = true;

    evaluation.state.popupViewed = true;
    persist();

    const closeBtn = dialog.querySelector(".aarla-promo-dialog__close");
    closeBtn?.addEventListener("click", () => closePopup({ dismissed: true }));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePopup({ dismissed: true });
    });

    const copyBtn = dialog.querySelector(".aarla-promo-dialog__copy");
    copyBtn?.addEventListener("click", async () => {
      try {
        await window.navigator.clipboard.writeText(code);
        copyBtn.textContent = config.i18n?.copied || "Copied";
      } catch {
        log("clipboard copy failed");
      }
    });

    document.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => {
      const focusTarget =
        /** @type {HTMLElement | null} */ (closeBtn) ||
        dialog?.querySelector("a, button");
      focusTarget?.focus();
    }, 0);
  }

  /**
   * @param {{ dismissed?: boolean }} [options]
   */
  function closePopup(options = {}) {
    if (!isOpen || !root) return;
    const overlay = root.querySelector(".aarla-promo-overlay");
    overlay?.remove();
    dialog = null;
    isOpen = false;
    document.removeEventListener("keydown", onKeyDown);

    if (options.dismissed) {
      evaluation.state.popupDismissed = true;
      evaluation.state.popupDismissedAt = Date.now();
      persist();
    }

    if (config.global.showReminderBadge && !evaluation.state.badgeDismissed) {
      showBadge();
    }

    if (previouslyFocused && "focus" in previouslyFocused) {
      try {
        /** @type {HTMLElement} */ (previouslyFocused).focus();
      } catch {
        // Ignore focus restore failures.
      }
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  function onKeyDown(event) {
    if (!isOpen || !dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closePopup({ dismissed: true });
      return;
    }
    if (event.key === "Tab") {
      trapFocus(event, dialog);
    }
  }

  /**
   * @param {KeyboardEvent} event
   * @param {HTMLElement} container
   */
  function trapFocus(event, container) {
    const focusable = Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el instanceof HTMLElement && !el.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function destroy() {
    if (openTimer != null) window.clearTimeout(openTimer);
    document.removeEventListener("keydown", onKeyDown);
    root?.remove();
    root = null;
  }

  return {
    mount,
    openPopup,
    closePopup,
    destroy,
    getState: () => evaluation.state,
    getActivePromotion: () => evaluation.activePromotion,
  };
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {string} value
 */
function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export { buildDiscountUrl, hasDiscountCode };
