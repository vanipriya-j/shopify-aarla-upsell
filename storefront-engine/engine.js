/** @typedef {'FIRST_VISIT' | 'RETURNING_VISITOR' | 'UTM_CAMPAIGN' | 'LANDING_PAGE' | 'PRODUCT_VIEW' | 'PRODUCT_IN_CART' | 'COLLECTION_IN_CART'} AudienceType */

export const STORAGE_NAMESPACE = "aarla_promotions";

export const AUDIENCE_MATCH_ORDER = /** @type {const} */ ([
  "UTM_CAMPAIGN",
  "LANDING_PAGE",
  "PRODUCT_VIEW",
  "PRODUCT_IN_CART",
  "COLLECTION_IN_CART",
  "RETURNING_VISITOR",
  "FIRST_VISIT",
]);

/**
 * @typedef {object} UtmParams
 * @property {string} [utm_source]
 * @property {string} [utm_medium]
 * @property {string} [utm_campaign]
 * @property {string} [utm_content]
 * @property {string} [utm_term]
 */

/**
 * @typedef {object} PromotionTarget
 * @property {string} targetType
 * @property {string} shopifyResourceId
 */

/**
 * @typedef {object} PromotionConfig
 * @property {string} id
 * @property {boolean} enabled
 * @property {number} priority
 * @property {AudienceType | string} audienceType
 * @property {string} [displayType]
 * @property {string} headline
 * @property {string} message
 * @property {string} discountCode
 * @property {string} ctaText
 * @property {string} ctaUrl
 * @property {number} [popupDelayMs]
 * @property {number} validityHours
 * @property {boolean} showOnce
 * @property {number} dismissalSuppressionHours
 * @property {string} [utmSource]
 * @property {string} [utmMedium]
 * @property {string} [utmCampaign]
 * @property {string} [utmContent]
 * @property {string} [landingPath]
 * @property {string} [landingPagePath] legacy alias
 * @property {string} [ctaDestination] legacy alias for ctaUrl
 * @property {number | null} [minimumCartValue]
 * @property {PromotionTarget[]} [targets]
 * @property {string} [key] legacy alias for id (tests / migration)
 */

/**
 * @typedef {object} GlobalConfig
 * @property {boolean} enabled
 * @property {boolean} testMode
 * @property {'automatic' | string} testPreview
 * @property {number} popupDelayMs
 * @property {'center' | 'bottom-left' | 'bottom-right'} popupPosition
 * @property {number} popupMaxWidth
 * @property {number} overlayOpacity
 * @property {number} borderRadius
 * @property {boolean} showReminderBadge
 * @property {boolean} debugLogging
 * @property {string} [apiEndpoint]
 */

/**
 * @typedef {object} AppConfig
 * @property {GlobalConfig} global
 * @property {PromotionConfig[]} [promotions]
 * @property {Record<string, string>} [i18n]
 */

/**
 * @typedef {object} VisitorState
 * @property {string} visitorId
 * @property {number} firstVisitAt
 * @property {number} lastVisitAt
 * @property {string | null} activePromotionKey
 * @property {string | null} activeDiscountCode
 * @property {number | null} promotionActivatedAt
 * @property {number | null} promotionExpiresAt
 * @property {boolean} popupViewed
 * @property {boolean} popupDismissed
 * @property {number | null} popupDismissedAt
 * @property {boolean} badgeDismissed
 * @property {boolean} [hasActivatedPromotion] sticky flag — survives clear/expiry
 */

/**
 * @typedef {object} CartLine
 * @property {string | number} [product_id]
 * @property {string | number} [variant_id]
 * @property {string} [product_gid]
 * @property {string} [variant_gid]
 * @property {number} [final_line_price]
 * @property {number} [line_price]
 * @property {number} [quantity]
 */

/**
 * @typedef {object} StorefrontContext
 * @property {UtmParams} utm
 * @property {string} currentPath
 * @property {boolean} isFirstTimeVisitor
 * @property {boolean} [isReturningVisitor]
 * @property {string | null} [productId]
 * @property {string | null} [variantId]
 * @property {CartLine[]} [cartItems]
 * @property {number} [cartTotal]
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeMatchValue(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/**
 * @param {string | null | undefined} path
 * @returns {string}
 */
export function normalizePath(path) {
  if (!path) return "";
  let normalized = String(path).trim();
  if (!normalized) return "";
  try {
    if (/^https?:\/\//i.test(normalized)) {
      normalized = new URL(normalized).pathname;
    }
  } catch {
    // Keep original path-like value.
  }
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.toLowerCase();
}

/**
 * Normalize Shopify GID or numeric id for comparison.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeResourceId(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("gid://")) return lower;
  // Numeric Ajax cart ids → compare by trailing numeric segment as well.
  return lower;
}

/**
 * @param {string} a
 * @param {string} b
 */
export function resourceIdsMatch(a, b) {
  const left = normalizeResourceId(a);
  const right = normalizeResourceId(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftNum = left.includes("/") ? left.split("/").pop() : left;
  const rightNum = right.includes("/") ? right.split("/").pop() : right;
  return Boolean(leftNum && rightNum && leftNum === rightNum);
}

/**
 * @param {string | URLSearchParams | Record<string, string | undefined>} search
 * @returns {UtmParams}
 */
export function readUtmParams(search) {
  /** @type {URLSearchParams} */
  let params;
  if (search instanceof URLSearchParams) {
    params = search;
  } else if (typeof search === "string") {
    params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
  } else {
    params = new URLSearchParams();
    Object.entries(search || {}).forEach(([key, value]) => {
      if (value != null && value !== "") params.set(key, String(value));
    });
  }

  return {
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    utm_content: params.get("utm_content") || undefined,
    utm_term: params.get("utm_term") || undefined,
  };
}

/**
 * @param {PromotionConfig} promotion
 * @returns {string}
 */
export function getPromotionId(promotion) {
  return promotion.id || promotion.key || "";
}

/**
 * @param {PromotionConfig} promotion
 * @returns {string}
 */
export function getCtaUrl(promotion) {
  return promotion.ctaUrl || promotion.ctaDestination || "/";
}

/**
 * @param {PromotionConfig} promotion
 * @returns {string}
 */
export function getLandingPath(promotion) {
  return promotion.landingPath || promotion.landingPagePath || "";
}

/**
 * Empty UTM fields are ignored rather than treated as required matches.
 * @param {PromotionConfig} promotion
 * @param {UtmParams} utm
 * @returns {boolean}
 */
export function matchesUtm(promotion, utm) {
  /** @type {Array<[keyof UtmParams, string | undefined]>} */
  const pairs = [
    ["utm_source", promotion.utmSource],
    ["utm_medium", promotion.utmMedium],
    ["utm_campaign", promotion.utmCampaign],
    ["utm_content", promotion.utmContent],
  ];

  const configured = pairs.filter(([, expected]) =>
    normalizeMatchValue(expected),
  );
  if (configured.length === 0) return false;

  return configured.every(([param, expected]) => {
    return normalizeMatchValue(utm[param]) === normalizeMatchValue(expected);
  });
}

/**
 * @param {PromotionConfig} promotion
 * @param {string} currentPath
 * @returns {boolean}
 */
export function matchesLandingPage(promotion, currentPath) {
  const expected = normalizePath(getLandingPath(promotion));
  if (!expected) return false;
  return normalizePath(currentPath) === expected;
}

/**
 * @param {PromotionConfig[]} promotions
 * @returns {PromotionConfig[]}
 */
export function sortByPriorityDesc(promotions) {
  return [...promotions].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return getPromotionId(a).localeCompare(getPromotionId(b));
  });
}

/**
 * Contextual promotions that first-visit must never replace.
 * @param {PromotionConfig} promotion
 * @returns {boolean}
 */
export function isCampaignPromotion(promotion) {
  const type = inferAudienceType(promotion);
  return (
    type === "UTM_CAMPAIGN" ||
    type === "LANDING_PAGE" ||
    type === "PRODUCT_VIEW" ||
    type === "PRODUCT_IN_CART" ||
    type === "COLLECTION_IN_CART"
  );
}

/**
 * Infer audience type from explicit field or legacy keys.
 * @param {PromotionConfig} promotion
 * @returns {string}
 */
export function inferAudienceType(promotion) {
  if (promotion.audienceType) return promotion.audienceType;
  const key = promotion.key || promotion.id;
  if (key === "welcome") return "FIRST_VISIT";
  if (
    getLandingPath(promotion) &&
    !promotion.utmSource &&
    !promotion.utmCampaign
  ) {
    return "LANDING_PAGE";
  }
  if (promotion.utmSource || promotion.utmCampaign || promotion.utmMedium) {
    return "UTM_CAMPAIGN";
  }
  if (key === "campaign_a" || key === "campaign_b") return "UTM_CAMPAIGN";
  return "FIRST_VISIT";
}

/**
 * @param {PromotionConfig} promotion
 * @param {string | null | undefined} productId
 * @param {string | null | undefined} variantId
 */
export function matchesProductView(promotion, productId, variantId) {
  const targets = promotion.targets || [];
  if (!targets.length) return false;

  if (productId) {
    const productHit = targets.some(
      (t) =>
        (t.targetType === "QUALIFYING_PRODUCT" ||
          t.targetType === "PROMOTED_PRODUCT") &&
        resourceIdsMatch(t.shopifyResourceId, productId),
    );
    if (productHit) return true;
  }

  if (variantId) {
    return targets.some(
      (t) =>
        (t.targetType === "QUALIFYING_VARIANT" ||
          t.targetType === "PROMOTED_VARIANT") &&
        resourceIdsMatch(t.shopifyResourceId, variantId),
    );
  }

  return false;
}

/**
 * Match cart lines against qualifying product/variant targets.
 * Collection membership should already be expanded to product IDs on save.
 * @param {PromotionConfig} promotion
 * @param {CartLine[]} cartItems
 * @param {number} [cartTotal]
 */
export function matchesProductInCart(promotion, cartItems = [], cartTotal = 0) {
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
      if (
        t.targetType === "QUALIFYING_PRODUCT" &&
        resourceIdsMatch(t.shopifyResourceId, productId)
      ) {
        return true;
      }
      if (
        t.targetType === "QUALIFYING_VARIANT" &&
        resourceIdsMatch(t.shopifyResourceId, variantId)
      ) {
        return true;
      }
      return false;
    });
  });
}

/**
 * Collection-in-cart: use expanded qualifying product IDs from configuration.
 * @param {PromotionConfig} promotion
 * @param {CartLine[]} cartItems
 * @param {number} [cartTotal]
 */
export function matchesCollectionInCart(
  promotion,
  cartItems = [],
  cartTotal = 0,
) {
  return matchesProductInCart(promotion, cartItems, cartTotal);
}

/**
 * @param {number} cartTotal
 * @param {CartLine[]} cartItems
 */
function normalizeCartTotal(cartTotal, cartItems) {
  if (!Number.isFinite(cartTotal)) return 0;
  // Ajax `/cart.js` uses cents. If total is large, convert to major units.
  if (
    cartTotal >= 1000 ||
    cartItems.some((i) => (i.final_line_price || 0) >= 100)
  ) {
    return cartTotal / 100;
  }
  return cartTotal;
}

/**
 * @param {PromotionConfig} promotion
 * @param {StorefrontContext} context
 */
export function promotionMatchesContext(promotion, context) {
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
        context.variantId,
      );
    case "PRODUCT_IN_CART":
      return matchesProductInCart(
        promotion,
        context.cartItems || [],
        context.cartTotal || 0,
      );
    case "COLLECTION_IN_CART":
      return matchesCollectionInCart(
        promotion,
        context.cartItems || [],
        context.cartTotal || 0,
      );
    case "RETURNING_VISITOR":
      return Boolean(context.isReturningVisitor) && !context.isFirstTimeVisitor;
    case "FIRST_VISIT":
      return Boolean(context.isFirstTimeVisitor);
    default:
      return false;
  }
}

/**
 * Evaluation order:
 * 1. UTM campaign
 * 2. Landing page
 * 3. Product / collection context
 * 4. Returning visitor
 * 5. First visit
 * 6. None
 *
 * Within the same category, highest priority wins.
 *
 * @param {object} input
 * @param {PromotionConfig[]} input.promotions
 * @param {UtmParams} input.utm
 * @param {string} input.currentPath
 * @param {boolean} input.isFirstTimeVisitor
 * @param {boolean} [input.isReturningVisitor]
 * @param {string | null} [input.productId]
 * @param {string | null} [input.variantId]
 * @param {CartLine[]} [input.cartItems]
 * @param {number} [input.cartTotal]
 * @returns {PromotionConfig | null}
 */
export function selectPromotion({
  promotions,
  utm,
  currentPath,
  isFirstTimeVisitor,
  isReturningVisitor,
  productId = null,
  variantId = null,
  cartItems = [],
  cartTotal = 0,
}) {
  const context = {
    utm,
    currentPath,
    isFirstTimeVisitor,
    isReturningVisitor:
      isReturningVisitor != null ? isReturningVisitor : !isFirstTimeVisitor,
    productId,
    variantId,
    cartItems,
    cartTotal,
  };

  const enabled = promotions.filter((promo) => promo.enabled);

  for (const audienceType of AUDIENCE_MATCH_ORDER) {
    const candidates = sortByPriorityDesc(
      enabled.filter((promo) => inferAudienceType(promo) === audienceType),
    );
    const match = candidates.find((promo) =>
      promotionMatchesContext(promo, context),
    );
    if (match) return match;
  }

  return null;
}

/**
 * @param {VisitorState} state
 * @param {number} now
 * @returns {boolean}
 */
export function isPromotionExpired(state, now = Date.now()) {
  if (!state.activePromotionKey) return true;
  if (state.promotionExpiresAt == null) return false;
  return now >= state.promotionExpiresAt;
}

/**
 * Decide whether a newly matched promotion should replace the active one.
 * First-visit must never replace an active campaign/contextual promotion.
 * A higher-priority campaign may replace a lower-priority active promotion.
 *
 * @param {object} input
 * @param {PromotionConfig | null} input.candidate
 * @param {VisitorState} input.state
 * @param {PromotionConfig[]} input.promotions
 * @param {number} [input.now]
 * @returns {{ action: 'keep' | 'activate' | 'replace' | 'clear', promotion: PromotionConfig | null }}
 */
export function resolveActivePromotion({
  candidate,
  state,
  promotions,
  now = Date.now(),
}) {
  const expired = isPromotionExpired(state, now);
  const active =
    !expired && state.activePromotionKey
      ? promotions.find(
          (promo) => getPromotionId(promo) === state.activePromotionKey,
        ) || null
      : null;

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

  // First-visit must never replace an active campaign promotion.
  if (
    inferAudienceType(candidate) === "FIRST_VISIT" &&
    isCampaignPromotion(active)
  ) {
    return { action: "keep", promotion: active };
  }

  if (isCampaignPromotion(candidate) && isCampaignPromotion(active)) {
    if (candidate.priority > active.priority) {
      return { action: "replace", promotion: candidate };
    }
    return { action: "keep", promotion: active };
  }

  if (
    isCampaignPromotion(candidate) &&
    inferAudienceType(active) === "FIRST_VISIT"
  ) {
    return { action: "replace", promotion: candidate };
  }

  // Higher priority wins across remaining cases (e.g. returning vs first).
  if (candidate.priority > active.priority) {
    return { action: "replace", promotion: candidate };
  }

  return { action: "keep", promotion: active };
}

/**
 * @param {VisitorState} state
 * @param {PromotionConfig} promotion
 * @param {number} [now]
 * @returns {boolean}
 */
export function shouldSuppressPopup(state, promotion, now = Date.now()) {
  const id = getPromotionId(promotion);
  if (
    state.activePromotionKey === id &&
    promotion.showOnce &&
    state.popupViewed
  ) {
    return true;
  }

  if (
    state.activePromotionKey === id &&
    state.popupDismissed &&
    state.popupDismissedAt != null
  ) {
    const suppressMs =
      Math.max(0, promotion.dismissalSuppressionHours) * 60 * 60 * 1000;
    if (now < state.popupDismissedAt + suppressMs) {
      return true;
    }
  }

  return false;
}

/**
 * @param {string} code
 * @param {string} redirectPath
 * @returns {string}
 */
export function buildDiscountUrl(code, redirectPath) {
  const encodedCode = encodeURIComponent(String(code || "").trim());
  const path =
    redirectPath && String(redirectPath).trim()
      ? String(redirectPath).trim()
      : "/";
  const encodedRedirect = encodeURIComponent(path);
  return `/discount/${encodedCode}?redirect=${encodedRedirect}`;
}

/**
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
export function hasDiscountCode(code) {
  return Boolean(code && String(code).trim());
}

/**
 * @param {number} [now]
 * @param {() => string} [idFactory]
 * @returns {VisitorState}
 */
export function createVisitorState(
  now = Date.now(),
  idFactory = createVisitorId,
) {
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
    badgeDismissed: false,
    hasActivatedPromotion: false,
  };
}

/**
 * @returns {string}
 */
export function createVisitorId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `aarla_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {VisitorState} state
 * @returns {VisitorState}
 */
export function clearActivePromotion(state) {
  return {
    ...state,
    activePromotionKey: null,
    activeDiscountCode: null,
    promotionActivatedAt: null,
    promotionExpiresAt: null,
    popupViewed: false,
    popupDismissed: false,
    popupDismissedAt: null,
    badgeDismissed: false,
    // Keep sticky visit marker so expired campaigns don't re-trigger first-visit.
    hasActivatedPromotion:
      Boolean(state.hasActivatedPromotion) ||
      Boolean(state.activePromotionKey) ||
      state.promotionActivatedAt != null ||
      state.popupViewed ||
      state.popupDismissed,
  };
}

/**
 * @param {VisitorState} state
 * @param {PromotionConfig} promotion
 * @param {number} [now]
 * @returns {VisitorState}
 */
export function activatePromotion(state, promotion, now = Date.now()) {
  const validityHours = Math.max(0, Number(promotion.validityHours) || 0);
  return {
    ...state,
    activePromotionKey: getPromotionId(promotion),
    activeDiscountCode: hasDiscountCode(promotion.discountCode)
      ? String(promotion.discountCode).trim()
      : null,
    promotionActivatedAt: now,
    promotionExpiresAt: now + validityHours * 60 * 60 * 1000,
    popupViewed: false,
    popupDismissed: false,
    popupDismissedAt: null,
    badgeDismissed: false,
    hasActivatedPromotion: true,
  };
}

/**
 * First-time visitor = no existing Aarla visit marker in localStorage.
 * @param {VisitorState | null} state
 * @returns {boolean}
 */
export function isFirstTimeVisitor(state) {
  return state == null;
}

/**
 * Filter promotions that are enabled and within schedule window.
 * @param {PromotionConfig[]} promotions
 * @param {number} [now]
 * @param {{ startsAt?: string | number | Date | null, endsAt?: string | number | Date | null }} [scheduleFields]
 */
export function filterScheduledPromotions(promotions, now = Date.now()) {
  return promotions.filter((promo) => {
    if (!promo.enabled) return false;
    const startsAt = /** @type {{ startsAt?: unknown }} */ (promo).startsAt;
    const endsAt = /** @type {{ endsAt?: unknown }} */ (promo).endsAt;
    if (startsAt) {
      const start = new Date(
        /** @type {string | number | Date} */ (startsAt),
      ).getTime();
      if (Number.isFinite(start) && now < start) return false;
    }
    if (endsAt) {
      const end = new Date(
        /** @type {string | number | Date} */ (endsAt),
      ).getTime();
      if (Number.isFinite(end) && now > end) return false;
    }
    return true;
  });
}
