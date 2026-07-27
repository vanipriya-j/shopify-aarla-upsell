"use strict";
(() => {
  // extensions/aarla-promotions/src/engine.js
  var STORAGE_NAMESPACE = "aarla_promotions";
  function normalizeMatchValue(value) {
    if (value == null) return "";
    return String(value).trim().toLowerCase();
  }
  function normalizePath(path) {
    if (!path) return "";
    let normalized = String(path).trim();
    if (!normalized) return "";
    try {
      if (/^https?:\/\//i.test(normalized)) {
        normalized = new URL(normalized).pathname;
      }
    } catch (e) {
    }
    if (!normalized.startsWith("/")) normalized = `/${normalized}`;
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  }
  function readUtmParams(search) {
    let params;
    if (search instanceof URLSearchParams) {
      params = search;
    } else if (typeof search === "string") {
      params = new URLSearchParams(
        search.startsWith("?") ? search.slice(1) : search
      );
    } else {
      params = new URLSearchParams();
      Object.entries(search || {}).forEach(([key, value]) => {
        if (value != null && value !== "") params.set(key, String(value));
      });
    }
    return {
      utm_source: params.get("utm_source") || void 0,
      utm_medium: params.get("utm_medium") || void 0,
      utm_campaign: params.get("utm_campaign") || void 0,
      utm_content: params.get("utm_content") || void 0,
      utm_term: params.get("utm_term") || void 0
    };
  }
  function matchesUtm(promotion, utm) {
    const pairs = [
      ["utm_source", promotion.utmSource],
      ["utm_medium", promotion.utmMedium],
      ["utm_campaign", promotion.utmCampaign],
      ["utm_content", promotion.utmContent]
    ];
    const configured = pairs.filter(
      ([, expected]) => normalizeMatchValue(expected)
    );
    if (configured.length === 0) return false;
    return configured.every(([param, expected]) => {
      return normalizeMatchValue(utm[param]) === normalizeMatchValue(expected);
    });
  }
  function matchesLandingPage(promotion, currentPath) {
    const expected = normalizePath(promotion.landingPagePath);
    if (!expected) return false;
    return normalizePath(currentPath) === expected;
  }
  function sortByPriorityDesc(promotions) {
    return [...promotions].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.key.localeCompare(b.key);
    });
  }
  function isCampaignPromotion(promotion) {
    return promotion.key === "campaign_a" || promotion.key === "campaign_b";
  }
  function selectPromotion({
    promotions,
    utm,
    currentPath,
    isFirstTimeVisitor: isFirstTimeVisitor2
  }) {
    const enabled = promotions.filter((promo) => promo.enabled);
    const campaigns = sortByPriorityDesc(enabled.filter(isCampaignPromotion));
    const utmMatch = campaigns.find((promo) => matchesUtm(promo, utm));
    if (utmMatch) return utmMatch;
    const landingMatch = campaigns.find(
      (promo) => matchesLandingPage(promo, currentPath)
    );
    if (landingMatch) return landingMatch;
    if (isFirstTimeVisitor2) {
      const welcome = enabled.find((promo) => promo.key === "welcome");
      if (welcome) return welcome;
    }
    return null;
  }
  function isPromotionExpired(state, now = Date.now()) {
    if (!state.activePromotionKey) return true;
    if (state.promotionExpiresAt == null) return false;
    return now >= state.promotionExpiresAt;
  }
  function resolveActivePromotion({
    candidate,
    state,
    promotions,
    now = Date.now()
  }) {
    const expired = isPromotionExpired(state, now);
    const active = !expired && state.activePromotionKey ? promotions.find((promo) => promo.key === state.activePromotionKey) || null : null;
    if (!active) {
      if (candidate) return { action: "activate", promotion: candidate };
      if (state.activePromotionKey && expired) {
        return { action: "clear", promotion: null };
      }
      return { action: "keep", promotion: null };
    }
    if (!candidate) {
      return { action: "keep", promotion: active };
    }
    if (candidate.key === active.key) {
      return { action: "keep", promotion: active };
    }
    if (candidate.key === "welcome" && isCampaignPromotion(active)) {
      return { action: "keep", promotion: active };
    }
    if (isCampaignPromotion(candidate) && isCampaignPromotion(active)) {
      if (candidate.priority > active.priority) {
        return { action: "replace", promotion: candidate };
      }
      return { action: "keep", promotion: active };
    }
    if (isCampaignPromotion(candidate) && active.key === "welcome") {
      return { action: "replace", promotion: candidate };
    }
    return { action: "keep", promotion: active };
  }
  function shouldSuppressPopup(state, promotion, now = Date.now()) {
    if (state.activePromotionKey === promotion.key && promotion.showOnce && state.popupViewed) {
      return true;
    }
    if (state.activePromotionKey === promotion.key && state.popupDismissed && state.popupDismissedAt != null) {
      const suppressMs = Math.max(0, promotion.dismissalSuppressionHours) * 60 * 60 * 1e3;
      if (now < state.popupDismissedAt + suppressMs) {
        return true;
      }
    }
    return false;
  }
  function buildDiscountUrl(code, redirectPath) {
    const encodedCode = encodeURIComponent(String(code || "").trim());
    const path = redirectPath && String(redirectPath).trim() ? String(redirectPath).trim() : "/";
    const encodedRedirect = encodeURIComponent(path);
    return `/discount/${encodedCode}?redirect=${encodedRedirect}`;
  }
  function hasDiscountCode(code) {
    return Boolean(code && String(code).trim());
  }
  function createVisitorState(now = Date.now(), idFactory = createVisitorId) {
    return {
      visitorId: idFactory(),
      firstVisitAt: now,
      lastVisitAt: now,
      activePromotionKey: null,
      activeDiscountCode: null,
      promotionActivatedAt: null,
      promotionExpiresAt: null,
      popupViewed: false,
      popupDismissed: false,
      popupDismissedAt: null,
      badgeDismissed: false
    };
  }
  function createVisitorId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `aarla_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function clearActivePromotion(state) {
    return {
      ...state,
      activePromotionKey: null,
      activeDiscountCode: null,
      promotionActivatedAt: null,
      promotionExpiresAt: null,
      popupViewed: false,
      popupDismissed: false,
      popupDismissedAt: null,
      badgeDismissed: false
    };
  }
  function activatePromotion(state, promotion, now = Date.now()) {
    const validityHours = Math.max(0, Number(promotion.validityHours) || 0);
    return {
      ...state,
      activePromotionKey: promotion.key,
      activeDiscountCode: hasDiscountCode(promotion.discountCode) ? String(promotion.discountCode).trim() : null,
      promotionActivatedAt: now,
      promotionExpiresAt: now + validityHours * 60 * 60 * 1e3,
      popupViewed: false,
      popupDismissed: false,
      popupDismissedAt: null,
      badgeDismissed: false
    };
  }
  function isFirstTimeVisitor(state) {
    return state == null;
  }

  // extensions/aarla-promotions/src/storage.js
  function readVisitorState(storage) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_NAMESPACE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizeState(parsed);
    } catch (e) {
      return null;
    }
  }
  function writeVisitorState(storage, state) {
    if (!storage) return;
    storage.setItem(STORAGE_NAMESPACE, JSON.stringify(state));
  }
  function touchVisitorState(state, now = Date.now()) {
    return {
      ...state,
      lastVisitAt: now
    };
  }
  function ensureVisitorState(storage, now = Date.now()) {
    const existing = readVisitorState(storage);
    const firstVisit = isFirstTimeVisitor(existing);
    if (firstVisit) {
      const state2 = createVisitorState(now);
      writeVisitorState(storage, state2);
      return { state: state2, isFirstVisit: true };
    }
    const state = touchVisitorState(
      /** @type {import('./engine.js').VisitorState} */
      existing,
      now
    );
    writeVisitorState(storage, state);
    return { state, isFirstVisit: false };
  }
  function normalizeState(raw) {
    return {
      visitorId: typeof raw.visitorId === "string" ? raw.visitorId : createFallbackId(),
      firstVisitAt: numberOr(raw.firstVisitAt, Date.now()),
      lastVisitAt: numberOr(raw.lastVisitAt, Date.now()),
      activePromotionKey: normalizeKey(raw.activePromotionKey),
      activeDiscountCode: typeof raw.activeDiscountCode === "string" && raw.activeDiscountCode.trim() ? raw.activeDiscountCode.trim() : null,
      promotionActivatedAt: nullableNumber(raw.promotionActivatedAt),
      promotionExpiresAt: nullableNumber(raw.promotionExpiresAt),
      popupViewed: Boolean(raw.popupViewed),
      popupDismissed: Boolean(raw.popupDismissed),
      popupDismissedAt: nullableNumber(raw.popupDismissedAt),
      badgeDismissed: Boolean(raw.badgeDismissed)
    };
  }
  function normalizeKey(value) {
    if (value === "welcome" || value === "campaign_a" || value === "campaign_b") {
      return value;
    }
    return null;
  }
  function numberOr(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function nullableNumber(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function createFallbackId() {
    return `aarla_${Date.now().toString(36)}`;
  }
  function createMemoryStorage() {
    const map = /* @__PURE__ */ new Map();
    return {
      get length() {
        return map.size;
      },
      clear() {
        map.clear();
      },
      getItem(key) {
        return map.has(key) ? (
          /** @type {string} */
          map.get(key)
        ) : null;
      },
      key(index) {
        var _a;
        return (_a = Array.from(map.keys())[index]) != null ? _a : null;
      },
      removeItem(key) {
        map.delete(key);
      },
      setItem(key, value) {
        map.set(String(key), String(value));
      }
    };
  }

  // extensions/aarla-promotions/src/storefront.js
  var ROOT_ID = "aarla-promo-root";
  var CONFIG_SELECTOR = "[data-aarla-promotions-config]";
  function loadConfigFromDocument(document2) {
    const nodes = Array.from(document2.querySelectorAll(CONFIG_SELECTOR));
    if (!nodes.length) return null;
    let global = {};
    const promotions = [];
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
      } catch (e) {
      }
    }
    if (!promotions.some((promo) => promo.key === "welcome")) {
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
        borderRadius: Number.isFinite(Number(global.borderRadius)) ? Number(global.borderRadius) : 12,
        showReminderBadge: Boolean(global.showReminderBadge),
        debugLogging: Boolean(global.debugLogging)
      },
      promotions,
      i18n
    };
  }
  function normalizePreview(value) {
    if (value === "welcome" || value === "campaign_a" || value === "campaign_b" || value === "automatic") {
      return value;
    }
    return "automatic";
  }
  function normalizePosition(value) {
    if (value === "bottom-left" || value === "bottom-right" || value === "center") {
      return value;
    }
    return "center";
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function evaluatePromotionsForVisit({
    config,
    liveStorage,
    search,
    pathname,
    now = Date.now(),
    testStorage
  }) {
    const testMode = Boolean(config.global.testMode);
    const storage = testMode ? testStorage || createMemoryStorage() : liveStorage;
    const liveSnapshot = liveStorage ? readVisitorState(liveStorage) : null;
    const utm = readUtmParams(search);
    let isFirstVisit = false;
    let state;
    if (testMode) {
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
    let candidate = null;
    if (testMode && config.global.testPreview !== "automatic") {
      candidate = config.promotions.find(
        (promo) => promo.enabled && promo.key === config.global.testPreview
      ) || null;
    } else {
      candidate = selectPromotion({
        promotions: config.promotions,
        utm,
        currentPath: pathname,
        isFirstTimeVisitor: isFirstVisit || testMode && config.global.testPreview === "automatic"
      });
    }
    const resolution = resolveActivePromotion({
      candidate,
      state,
      promotions: config.promotions,
      now
    });
    if (resolution.action === "clear") {
      state = clearActivePromotion(state);
    } else if ((resolution.action === "activate" || resolution.action === "replace") && resolution.promotion) {
      state = activatePromotion(state, resolution.promotion, now);
    }
    writeVisitorState(storage, state);
    const activePromotion = state.activePromotionKey ? config.promotions.find(
      (promo) => promo.key === state.activePromotionKey
    ) || null : null;
    const suppressPopup = activePromotion ? shouldSuppressPopup(state, activePromotion, now) && !testMode : true;
    return {
      testMode,
      storage,
      state,
      activePromotion,
      suppressPopup,
      liveSnapshot,
      discountUrl: activePromotion && hasDiscountCode(activePromotion.discountCode) ? buildDiscountUrl(
        activePromotion.discountCode,
        activePromotion.ctaDestination || "/"
      ) : null
    };
  }
  function initAarlaPromotions(window2) {
    var _a;
    const document2 = window2.document;
    const config = loadConfigFromDocument(document2);
    if (!config || !config.global.enabled) return null;
    const log = (...args) => {
      if (config.global.debugLogging) {
        console.info("[Aarla Promotions]", ...args);
      }
    };
    const evaluation = evaluatePromotionsForVisit({
      config,
      liveStorage: window2.localStorage,
      search: window2.location.search,
      pathname: window2.location.pathname
    });
    log("evaluation", {
      active: ((_a = evaluation.activePromotion) == null ? void 0 : _a.key) || null,
      suppressPopup: evaluation.suppressPopup,
      testMode: evaluation.testMode
    });
    const controller = createUiController({
      window: window2,
      document: document2,
      config,
      evaluation,
      log
    });
    controller.mount();
    return controller;
  }
  function createUiController({ window: window2, document: document2, config, evaluation, log }) {
    let root = null;
    let dialog = null;
    let badge = null;
    let previouslyFocused = null;
    let openTimer = null;
    let isOpen = false;
    const reducedMotion = window2.matchMedia ? window2.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    function persist() {
      writeVisitorState(evaluation.storage, evaluation.state);
    }
    function mount() {
      if (document2.getElementById(ROOT_ID)) return;
      root = document2.createElement("div");
      root.id = ROOT_ID;
      root.className = "aarla-promo-root";
      root.dataset.position = config.global.popupPosition;
      root.style.setProperty(
        "--aarla-promo-max-width",
        `${config.global.popupMaxWidth}px`
      );
      root.style.setProperty(
        "--aarla-promo-overlay-opacity",
        String(config.global.overlayOpacity)
      );
      root.style.setProperty(
        "--aarla-promo-radius",
        `${config.global.borderRadius}px`
      );
      if (reducedMotion) root.classList.add("aarla-promo-root--reduced-motion");
      document2.body.appendChild(root);
      if (!evaluation.activePromotion) {
        log("no active promotion");
        return;
      }
      renderBadge();
      if (!evaluation.suppressPopup) {
        const delay = Math.max(0, config.global.popupDelayMs || 0);
        openTimer = window2.setTimeout(() => openPopup(), delay);
      } else if (config.global.showReminderBadge && !evaluation.state.badgeDismissed) {
        showBadge();
      }
    }
    function renderBadge() {
      var _a, _b, _c, _d, _e;
      if (!root || !evaluation.activePromotion) return;
      if (badge) badge.remove();
      const promo = evaluation.activePromotion;
      const label = hasDiscountCode(promo.discountCode) ? (((_a = config.i18n) == null ? void 0 : _a.reminder_with_code) || "{{ code }} is active").replace(
        "{{ code }}",
        String(promo.discountCode).trim()
      ) : ((_b = config.i18n) == null ? void 0 : _b.reminder_without_code) || "Your Aarla offer is active";
      badge = document2.createElement("div");
      badge.className = "aarla-promo-badge";
      badge.hidden = true;
      badge.innerHTML = `
      <button type="button" class="aarla-promo-badge__open">${escapeHtml(label)}</button>
      <button type="button" class="aarla-promo-badge__dismiss" aria-label="${escapeHtml(
        ((_c = config.i18n) == null ? void 0 : _c.dismiss_reminder) || "Dismiss offer reminder"
      )}">\xD7</button>
    `;
      (_d = badge.querySelector(".aarla-promo-badge__open")) == null ? void 0 : _d.addEventListener("click", () => openPopup({ fromBadge: true }));
      (_e = badge.querySelector(".aarla-promo-badge__dismiss")) == null ? void 0 : _e.addEventListener("click", () => {
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
    function openPopup(_options = {}) {
      var _a, _b, _c, _d;
      if (!root || !evaluation.activePromotion || isOpen) return;
      const promo = evaluation.activePromotion;
      previouslyFocused = document2.activeElement;
      hideBadge();
      const code = hasDiscountCode(promo.discountCode) ? String(promo.discountCode).trim() : "";
      const ctaHref = code ? buildDiscountUrl(code, promo.ctaDestination || "/") : promo.ctaDestination || "/";
      const ctaLabel = code ? promo.ctaText || ((_a = config.i18n) == null ? void 0 : _a.apply_and_shop) || "Apply and shop" : promo.ctaText || "Shop";
      const overlay = document2.createElement("div");
      overlay.className = "aarla-promo-overlay";
      overlay.tabIndex = -1;
      dialog = document2.createElement("div");
      dialog.className = "aarla-promo-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "aarla-promo-title");
      dialog.innerHTML = `
      <button type="button" class="aarla-promo-dialog__close" aria-label="${escapeHtml(
        ((_b = config.i18n) == null ? void 0 : _b.close) || "Close"
      )}">\xD7</button>
      ${evaluation.testMode ? `<p class="aarla-promo-dialog__test">${escapeHtml(
        ((_c = config.i18n) == null ? void 0 : _c.test_mode_label) || "Test mode"
      )}</p>` : ""}
      <h2 id="aarla-promo-title" class="aarla-promo-dialog__title">${escapeHtml(
        promo.headline || ""
      )}</h2>
      <p class="aarla-promo-dialog__message">${escapeHtml(promo.message || "")}</p>
      ${code ? `<div class="aarla-promo-dialog__code-row">
              <code class="aarla-promo-dialog__code" data-aarla-code>${escapeHtml(code)}</code>
              <button type="button" class="aarla-promo-dialog__copy">${escapeHtml(
        ((_d = config.i18n) == null ? void 0 : _d.copy_code) || "Copy code"
      )}</button>
            </div>` : ""}
      <a class="aarla-promo-dialog__cta" href="${escapeAttribute(ctaHref)}">${escapeHtml(
        ctaLabel
      )}</a>
    `;
      overlay.appendChild(dialog);
      root.appendChild(overlay);
      isOpen = true;
      evaluation.state.popupViewed = true;
      persist();
      const closeBtn = dialog.querySelector(".aarla-promo-dialog__close");
      closeBtn == null ? void 0 : closeBtn.addEventListener("click", () => closePopup({ dismissed: true }));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closePopup({ dismissed: true });
      });
      const copyBtn = dialog.querySelector(".aarla-promo-dialog__copy");
      copyBtn == null ? void 0 : copyBtn.addEventListener("click", async () => {
        var _a2;
        try {
          await window2.navigator.clipboard.writeText(code);
          copyBtn.textContent = ((_a2 = config.i18n) == null ? void 0 : _a2.copied) || "Copied";
        } catch (e) {
          log("clipboard copy failed");
        }
      });
      document2.addEventListener("keydown", onKeyDown);
      window2.setTimeout(() => {
        const focusTarget = (
          /** @type {HTMLElement | null} */
          closeBtn || (dialog == null ? void 0 : dialog.querySelector("a, button"))
        );
        focusTarget == null ? void 0 : focusTarget.focus();
      }, 0);
    }
    function closePopup(options = {}) {
      if (!isOpen || !root) return;
      const overlay = root.querySelector(".aarla-promo-overlay");
      overlay == null ? void 0 : overlay.remove();
      dialog = null;
      isOpen = false;
      document2.removeEventListener("keydown", onKeyDown);
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
          previouslyFocused.focus();
        } catch (e) {
        }
      }
    }
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
    function trapFocus(event, container) {
      const focusable = Array.from(
        container.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el instanceof HTMLElement && !el.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document2.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function destroy() {
      if (openTimer != null) window2.clearTimeout(openTimer);
      document2.removeEventListener("keydown", onKeyDown);
      root == null ? void 0 : root.remove();
      root = null;
    }
    return {
      mount,
      openPopup,
      closePopup,
      destroy,
      getState: () => evaluation.state,
      getActivePromotion: () => evaluation.activePromotion
    };
  }
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  // extensions/aarla-promotions/src/main.js
  function boot() {
    try {
      initAarlaPromotions(window);
    } catch (error) {
      console.error("[Aarla Promotions] failed to initialize", error);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
