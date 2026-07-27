"use strict";
(() => {
  // extensions/aarla-promotions/src/engine.js
  var STORAGE_NAMESPACE = "aarla_promotions";
  var AUDIENCE_MATCH_ORDER = (
    /** @type {const} */
    [
      "UTM_CAMPAIGN",
      "LANDING_PAGE",
      "PRODUCT_VIEW",
      "PRODUCT_IN_CART",
      "COLLECTION_IN_CART",
      "RETURNING_VISITOR",
      "FIRST_VISIT"
    ]
  );
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
  function normalizeResourceId(value) {
    if (value == null || value === "") return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (lower.startsWith("gid://")) return lower;
    return lower;
  }
  function resourceIdsMatch(a, b) {
    const left = normalizeResourceId(a);
    const right = normalizeResourceId(b);
    if (!left || !right) return false;
    if (left === right) return true;
    const leftNum = left.includes("/") ? left.split("/").pop() : left;
    const rightNum = right.includes("/") ? right.split("/").pop() : right;
    return Boolean(leftNum && rightNum && leftNum === rightNum);
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
  function getPromotionId(promotion) {
    return promotion.id || promotion.key || "";
  }
  function getCtaUrl(promotion) {
    return promotion.ctaUrl || promotion.ctaDestination || "/";
  }
  function getLandingPath(promotion) {
    return promotion.landingPath || promotion.landingPagePath || "";
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
    const expected = normalizePath(getLandingPath(promotion));
    if (!expected) return false;
    return normalizePath(currentPath) === expected;
  }
  function sortByPriorityDesc(promotions) {
    return [...promotions].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return getPromotionId(a).localeCompare(getPromotionId(b));
    });
  }
  function isCampaignPromotion(promotion) {
    const type = inferAudienceType(promotion);
    return type === "UTM_CAMPAIGN" || type === "LANDING_PAGE" || type === "PRODUCT_VIEW" || type === "PRODUCT_IN_CART" || type === "COLLECTION_IN_CART";
  }
  function inferAudienceType(promotion) {
    if (promotion.audienceType) return promotion.audienceType;
    const key = promotion.key || promotion.id;
    if (key === "welcome") return "FIRST_VISIT";
    if (getLandingPath(promotion) && !promotion.utmSource && !promotion.utmCampaign) {
      return "LANDING_PAGE";
    }
    if (promotion.utmSource || promotion.utmCampaign || promotion.utmMedium) {
      return "UTM_CAMPAIGN";
    }
    if (key === "campaign_a" || key === "campaign_b") return "UTM_CAMPAIGN";
    return "FIRST_VISIT";
  }
  function matchesProductView(promotion, productId, variantId) {
    const targets = promotion.targets || [];
    if (!targets.length) return false;
    if (productId) {
      const productHit = targets.some(
        (t) => (t.targetType === "QUALIFYING_PRODUCT" || t.targetType === "PROMOTED_PRODUCT") && resourceIdsMatch(t.shopifyResourceId, productId)
      );
      if (productHit) return true;
    }
    if (variantId) {
      return targets.some(
        (t) => (t.targetType === "QUALIFYING_VARIANT" || t.targetType === "PROMOTED_VARIANT") && resourceIdsMatch(t.shopifyResourceId, variantId)
      );
    }
    return false;
  }
  function matchesProductInCart(promotion, cartItems = [], cartTotal = 0) {
    const targets = promotion.targets || [];
    if (!targets.length) return false;
    const min = promotion.minimumCartValue;
    if (min != null && Number(min) > 0) {
      const normalizedCartTotal = normalizeCartTotal(cartTotal, cartItems);
      if (normalizedCartTotal < Number(min)) return false;
    }
    return cartItems.some((item) => {
      const productId = String(item.product_gid || item.product_id || "");
      const variantId = String(item.variant_gid || item.variant_id || "");
      return targets.some((t) => {
        if (t.targetType === "QUALIFYING_PRODUCT" && resourceIdsMatch(t.shopifyResourceId, productId)) {
          return true;
        }
        if (t.targetType === "QUALIFYING_VARIANT" && resourceIdsMatch(t.shopifyResourceId, variantId)) {
          return true;
        }
        return false;
      });
    });
  }
  function matchesCollectionInCart(promotion, cartItems = [], cartTotal = 0) {
    return matchesProductInCart(promotion, cartItems, cartTotal);
  }
  function normalizeCartTotal(cartTotal, cartItems) {
    if (!Number.isFinite(cartTotal)) return 0;
    if (cartTotal >= 1e3 || cartItems.some((i) => (i.final_line_price || 0) >= 100)) {
      return cartTotal / 100;
    }
    return cartTotal;
  }
  function promotionMatchesContext(promotion, context) {
    if (!promotion.enabled) return false;
    const type = inferAudienceType(promotion);
    switch (type) {
      case "UTM_CAMPAIGN":
        return matchesUtm(promotion, context.utm);
      case "LANDING_PAGE":
        return matchesLandingPage(promotion, context.currentPath);
      case "PRODUCT_VIEW":
        return matchesProductView(
          promotion,
          context.productId,
          context.variantId
        );
      case "PRODUCT_IN_CART":
        return matchesProductInCart(
          promotion,
          context.cartItems || [],
          context.cartTotal || 0
        );
      case "COLLECTION_IN_CART":
        return matchesCollectionInCart(
          promotion,
          context.cartItems || [],
          context.cartTotal || 0
        );
      case "RETURNING_VISITOR":
        return Boolean(context.isReturningVisitor) && !context.isFirstTimeVisitor;
      case "FIRST_VISIT":
        return Boolean(context.isFirstTimeVisitor);
      default:
        return false;
    }
  }
  function selectPromotion({
    promotions,
    utm,
    currentPath,
    isFirstTimeVisitor: isFirstTimeVisitor2,
    isReturningVisitor,
    productId = null,
    variantId = null,
    cartItems = [],
    cartTotal = 0
  }) {
    const context = {
      utm,
      currentPath,
      isFirstTimeVisitor: isFirstTimeVisitor2,
      isReturningVisitor: isReturningVisitor != null ? isReturningVisitor : !isFirstTimeVisitor2,
      productId,
      variantId,
      cartItems,
      cartTotal
    };
    const enabled = promotions.filter((promo) => promo.enabled);
    for (const audienceType of AUDIENCE_MATCH_ORDER) {
      const candidates = sortByPriorityDesc(
        enabled.filter((promo) => inferAudienceType(promo) === audienceType)
      );
      const match = candidates.find(
        (promo) => promotionMatchesContext(promo, context)
      );
      if (match) return match;
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
    const active = !expired && state.activePromotionKey ? promotions.find(
      (promo) => getPromotionId(promo) === state.activePromotionKey
    ) || null : null;
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
    if (getPromotionId(candidate) === getPromotionId(active)) {
      return { action: "keep", promotion: active };
    }
    if (inferAudienceType(candidate) === "FIRST_VISIT" && isCampaignPromotion(active)) {
      return { action: "keep", promotion: active };
    }
    if (isCampaignPromotion(candidate) && isCampaignPromotion(active)) {
      if (candidate.priority > active.priority) {
        return { action: "replace", promotion: candidate };
      }
      return { action: "keep", promotion: active };
    }
    if (isCampaignPromotion(candidate) && inferAudienceType(active) === "FIRST_VISIT") {
      return { action: "replace", promotion: candidate };
    }
    if (candidate.priority > active.priority) {
      return { action: "replace", promotion: candidate };
    }
    return { action: "keep", promotion: active };
  }
  function shouldSuppressPopup(state, promotion, now = Date.now()) {
    const id = getPromotionId(promotion);
    if (state.activePromotionKey === id && promotion.showOnce && state.popupViewed) {
      return true;
    }
    if (state.activePromotionKey === id && state.popupDismissed && state.popupDismissedAt != null) {
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
      activePromotionKey: getPromotionId(promotion),
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
  function filterScheduledPromotions(promotions, now = Date.now()) {
    return promotions.filter((promo) => {
      if (!promo.enabled) return false;
      const startsAt = (
        /** @type {{ startsAt?: unknown }} */
        promo.startsAt
      );
      const endsAt = (
        /** @type {{ endsAt?: unknown }} */
        promo.endsAt
      );
      if (startsAt) {
        const start = new Date(
          /** @type {string | number | Date} */
          startsAt
        ).getTime();
        if (Number.isFinite(start) && now < start) return false;
      }
      if (endsAt) {
        const end = new Date(
          /** @type {string | number | Date} */
          endsAt
        ).getTime();
        if (Number.isFinite(end) && now > end) return false;
      }
      return true;
    });
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
            if (!promo || !(promo.id || promo.key)) continue;
            const id = promo.id || promo.key;
            const index = promotions.findIndex(
              (item) => getPromotionId(item) === id
            );
            if (index >= 0)
              promotions[index] = { ...promotions[index], ...promo };
            else promotions.push(promo);
          }
        }
        if (parsed.i18n) i18n = { ...i18n, ...parsed.i18n };
      } catch (e) {
      }
    }
    return {
      global: {
        enabled: Boolean(global.enabled),
        testMode: Boolean(global.testMode),
        testPreview: global.testPreview || "automatic",
        popupDelayMs: Number(global.popupDelayMs) || 0,
        popupPosition: normalizePosition(global.popupPosition),
        popupMaxWidth: Number(global.popupMaxWidth) || 420,
        overlayOpacity: clamp(Number(global.overlayOpacity) || 0.45, 0, 1),
        borderRadius: Number.isFinite(Number(global.borderRadius)) ? Number(global.borderRadius) : 12,
        showReminderBadge: Boolean(global.showReminderBadge),
        debugLogging: Boolean(global.debugLogging),
        apiEndpoint: global.apiEndpoint || "/apps/aarla-promotions/active"
      },
      promotions,
      i18n
    };
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
  async function fetchActivePromotions(endpoint, fetchImpl = globalThis.fetch) {
    if (!endpoint || typeof fetchImpl !== "function") return [];
    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (!data || !Array.isArray(data.promotions)) return [];
      return data.promotions.map(normalizeFetchedPromotion);
    } catch (e) {
      return [];
    }
  }
  function normalizeFetchedPromotion(promo) {
    return {
      id: String(promo.id || ""),
      enabled: promo.enabled !== false,
      priority: Number(promo.priority) || 0,
      audienceType: String(promo.audienceType || "FIRST_VISIT"),
      displayType: String(promo.displayType || "POPUP"),
      headline: String(promo.headline || ""),
      message: String(promo.message || ""),
      discountCode: String(promo.discountCode || ""),
      ctaText: String(promo.ctaText || ""),
      ctaUrl: String(promo.ctaUrl || promo.ctaDestination || "/"),
      popupDelayMs: Number(promo.popupDelayMs) || 0,
      validityHours: Number(promo.validityHours) || 24,
      showOnce: Boolean(promo.showOnce),
      dismissalSuppressionHours: Number(promo.dismissalSuppressionHours) || 24,
      utmSource: promo.utmSource ? String(promo.utmSource) : void 0,
      utmMedium: promo.utmMedium ? String(promo.utmMedium) : void 0,
      utmCampaign: promo.utmCampaign ? String(promo.utmCampaign) : void 0,
      utmContent: promo.utmContent ? String(promo.utmContent) : void 0,
      landingPath: promo.landingPath ? String(promo.landingPath) : promo.landingPagePath ? String(promo.landingPagePath) : void 0,
      minimumCartValue: promo.minimumCartValue == null ? null : Number(promo.minimumCartValue),
      targets: Array.isArray(promo.targets) ? promo.targets.map((t) => ({
        targetType: String(t.targetType || ""),
        shopifyResourceId: String(t.shopifyResourceId || "")
      })) : [],
      startsAt: promo.startsAt,
      endsAt: promo.endsAt
    };
  }
  function readProductContext(window2) {
    var _a;
    const meta = window2.meta || ((_a = window2.ShopifyAnalytics) == null ? void 0 : _a.meta) || null;
    const product = meta == null ? void 0 : meta.product;
    if (!product) {
      return { productId: null, variantId: null };
    }
    return {
      productId: product.gid || (product.id != null ? String(product.id) : null),
      variantId: product.selectedVariantGid || (product.variants && product.variants[0] ? String(product.variants[0].id) : null)
    };
  }
  async function fetchCart(fetchImpl = globalThis.fetch) {
    try {
      const response = await fetchImpl("/cart.js", {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) return { items: [], total_price: 0 };
      const cart = await response.json();
      return {
        items: Array.isArray(cart.items) ? cart.items : [],
        total_price: Number(cart.total_price) || 0
      };
    } catch (e) {
      return { items: [], total_price: 0 };
    }
  }
  function evaluatePromotionsForVisit({
    config,
    promotions: promotionsInput,
    liveStorage,
    search,
    pathname,
    now = Date.now(),
    testStorage,
    productId = null,
    variantId = null,
    cartItems = [],
    cartTotal = 0
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
    const sourcePromotions = promotionsInput || config.promotions || /** @type {import('./engine.js').PromotionConfig[]} */
    [];
    const promotions = filterScheduledPromotions(sourcePromotions, now).map(
      (promo) => ({
        ...promo,
        enabled: promo.enabled !== false,
        ctaUrl: getCtaUrl(promo),
        id: getPromotionId(promo)
      })
    );
    let candidate = null;
    if (testMode && config.global.testPreview !== "automatic") {
      candidate = promotions.find(
        (promo) => promo.enabled && getPromotionId(promo) === config.global.testPreview
      ) || null;
    } else {
      candidate = selectPromotion({
        promotions,
        utm,
        currentPath: pathname,
        isFirstTimeVisitor: isFirstVisit || testMode && config.global.testPreview === "automatic",
        isReturningVisitor: !isFirstVisit,
        productId,
        variantId,
        cartItems,
        cartTotal
      });
    }
    const resolution = resolveActivePromotion({
      candidate,
      state,
      promotions,
      now
    });
    if (resolution.action === "clear") {
      state = clearActivePromotion(state);
    } else if ((resolution.action === "activate" || resolution.action === "replace") && resolution.promotion) {
      state = activatePromotion(state, resolution.promotion, now);
    }
    writeVisitorState(storage, state);
    const activePromotion = state.activePromotionKey ? promotions.find(
      (promo) => getPromotionId(promo) === state.activePromotionKey
    ) || null : null;
    const suppressPopup = activePromotion ? shouldSuppressPopup(state, activePromotion, now) && !testMode : true;
    const delayMs = activePromotion ? Number(activePromotion.popupDelayMs) || Number(config.global.popupDelayMs) || 0 : 0;
    return {
      testMode,
      storage,
      state,
      activePromotion,
      suppressPopup,
      liveSnapshot,
      delayMs,
      discountUrl: activePromotion && hasDiscountCode(activePromotion.discountCode) ? buildDiscountUrl(
        activePromotion.discountCode,
        getCtaUrl(activePromotion)
      ) : null
    };
  }
  function initAarlaPromotions(window2) {
    const document2 = window2.document;
    const config = loadConfigFromDocument(document2);
    if (!config || !config.global.enabled) return null;
    const log = (...args) => {
      if (config.global.debugLogging) {
        console.info("[Aarla Promotions]", ...args);
      }
    };
    const controller = createUiController({
      window: window2,
      document: document2,
      config,
      log
    });
    void controller.start();
    return controller;
  }
  function createUiController({ window: window2, document: document2, config, log }) {
    let root = null;
    let dialog = null;
    let badge = null;
    let previouslyFocused = null;
    let openTimer = null;
    let isOpen = false;
    let evaluation = null;
    const reducedMotion = window2.matchMedia ? window2.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    function persist() {
      if (!evaluation) return;
      writeVisitorState(evaluation.storage, evaluation.state);
    }
    async function start() {
      try {
        const endpoint = config.global.apiEndpoint || "/apps/aarla-promotions/active";
        const remotePromotions = await fetchActivePromotions(
          endpoint,
          window2.fetch.bind(window2)
        );
        if (!remotePromotions.length && !(config.promotions || []).length) {
          log("no promotions available");
          return;
        }
        const product = readProductContext(window2);
        const cart = await fetchCart(window2.fetch.bind(window2));
        evaluation = evaluatePromotionsForVisit({
          config,
          promotions: remotePromotions.length ? remotePromotions : config.promotions || [],
          liveStorage: window2.localStorage,
          search: window2.location.search,
          pathname: window2.location.pathname,
          productId: product.productId,
          variantId: product.variantId,
          cartItems: cart.items,
          cartTotal: cart.total_price
        });
        log("evaluation", {
          active: evaluation.activePromotion ? getPromotionId(evaluation.activePromotion) : null,
          suppressPopup: evaluation.suppressPopup,
          testMode: evaluation.testMode
        });
        mount();
      } catch (error) {
        log("initialization failed silently", error);
      }
    }
    function mount() {
      if (!(evaluation == null ? void 0 : evaluation.activePromotion)) return;
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
      renderBadge();
      if (!evaluation.suppressPopup) {
        const delay = Math.max(0, evaluation.delayMs || 0);
        openTimer = window2.setTimeout(() => openPopup(), delay);
      } else if (config.global.showReminderBadge && !evaluation.state.badgeDismissed) {
        showBadge();
      }
    }
    function renderBadge() {
      var _a, _b, _c, _d, _e;
      if (!root || !(evaluation == null ? void 0 : evaluation.activePromotion)) return;
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
      (_d = badge.querySelector(".aarla-promo-badge__open")) == null ? void 0 : _d.addEventListener("click", () => openPopup());
      (_e = badge.querySelector(".aarla-promo-badge__dismiss")) == null ? void 0 : _e.addEventListener("click", () => {
        evaluation.state.badgeDismissed = true;
        persist();
        hideBadge();
      });
      root.appendChild(badge);
    }
    function showBadge() {
      if (!badge || !config.global.showReminderBadge || !evaluation) return;
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
    function openPopup() {
      var _a, _b, _c, _d;
      if (!root || !(evaluation == null ? void 0 : evaluation.activePromotion) || isOpen) return;
      const promo = evaluation.activePromotion;
      previouslyFocused = document2.activeElement;
      hideBadge();
      const code = hasDiscountCode(promo.discountCode) ? String(promo.discountCode).trim() : "";
      const ctaHref = code ? buildDiscountUrl(code, getCtaUrl(promo)) : getCtaUrl(promo);
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
      if (!isOpen || !root || !evaluation) return;
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
      start,
      mount,
      openPopup,
      closePopup,
      destroy,
      getState: () => (evaluation == null ? void 0 : evaluation.state) || null,
      getActivePromotion: () => (evaluation == null ? void 0 : evaluation.activePromotion) || null
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
