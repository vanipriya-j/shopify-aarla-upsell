/** @typedef {'welcome' | 'campaign_a' | 'campaign_b'} PromotionKey */

export const STORAGE_NAMESPACE = "aarla_promotions";

export const PROMOTION_KEYS = /** @type {const} */ ([
  "welcome",
  "campaign_a",
  "campaign_b",
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
 * @typedef {object} PromotionConfig
 * @property {PromotionKey} key
 * @property {boolean} enabled
 * @property {number} priority
 * @property {string} headline
 * @property {string} message
 * @property {string} discountCode
 * @property {string} ctaText
 * @property {string} ctaDestination
 * @property {number} validityHours
 * @property {boolean} showOnce
 * @property {number} dismissalSuppressionHours
 * @property {string} [utmSource]
 * @property {string} [utmMedium]
 * @property {string} [utmCampaign]
 * @property {string} [utmContent]
 * @property {string} [landingPagePath]
 */

/**
 * @typedef {object} GlobalConfig
 * @property {boolean} enabled
 * @property {boolean} testMode
 * @property {'automatic' | PromotionKey} testPreview
 * @property {number} popupDelayMs
 * @property {'center' | 'bottom-left' | 'bottom-right'} popupPosition
 * @property {number} popupMaxWidth
 * @property {number} overlayOpacity
 * @property {number} borderRadius
 * @property {boolean} showReminderBadge
 * @property {boolean} debugLogging
 */

/**
 * @typedef {object} AppConfig
 * @property {GlobalConfig} global
 * @property {PromotionConfig[]} promotions
 * @property {Record<string, string>} [i18n]
 */

/**
 * @typedef {object} VisitorState
 * @property {string} visitorId
 * @property {number} firstVisitAt
 * @property {number} lastVisitAt
 * @property {PromotionKey | null} activePromotionKey
 * @property {string | null} activeDiscountCode
 * @property {number | null} promotionActivatedAt
 * @property {number | null} promotionExpiresAt
 * @property {boolean} popupViewed
 * @property {boolean} popupDismissed
 * @property {number | null} popupDismissedAt
 * @property {boolean} badgeDismissed
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
  const expected = normalizePath(promotion.landingPagePath);
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
    return a.key.localeCompare(b.key);
  });
}

/**
 * @param {PromotionConfig} promotion
 * @returns {boolean}
 */
export function isCampaignPromotion(promotion) {
  return promotion.key === "campaign_a" || promotion.key === "campaign_b";
}

/**
 * Evaluation order:
 * 1. Matching UTM campaign promotion (highest priority wins)
 * 2. Matching landing-page promotion (highest priority wins)
 * 3. First-time visitor welcome promotion
 * 4. No promotion
 *
 * @param {object} input
 * @param {PromotionConfig[]} input.promotions
 * @param {UtmParams} input.utm
 * @param {string} input.currentPath
 * @param {boolean} input.isFirstTimeVisitor
 * @returns {PromotionConfig | null}
 */
export function selectPromotion({
  promotions,
  utm,
  currentPath,
  isFirstTimeVisitor,
}) {
  const enabled = promotions.filter((promo) => promo.enabled);
  const campaigns = sortByPriorityDesc(enabled.filter(isCampaignPromotion));

  const utmMatch = campaigns.find((promo) => matchesUtm(promo, utm));
  if (utmMatch) return utmMatch;

  const landingMatch = campaigns.find((promo) =>
    matchesLandingPage(promo, currentPath),
  );
  if (landingMatch) return landingMatch;

  if (isFirstTimeVisitor) {
    const welcome = enabled.find((promo) => promo.key === "welcome");
    if (welcome) return welcome;
  }

  return null;
}

/**
 * @param {PromotionConfig | null} candidate
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
 * Welcome never replaces an active campaign.
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
      ? promotions.find((promo) => promo.key === state.activePromotionKey) ||
        null
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

  if (candidate.key === active.key) {
    return { action: "keep", promotion: active };
  }

  // Welcome must never replace an active campaign promotion.
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

/**
 * @param {VisitorState} state
 * @param {PromotionConfig} promotion
 * @param {number} [now]
 * @returns {boolean}
 */
export function shouldSuppressPopup(state, promotion, now = Date.now()) {
  if (
    state.activePromotionKey === promotion.key &&
    promotion.showOnce &&
    state.popupViewed
  ) {
    return true;
  }

  if (
    state.activePromotionKey === promotion.key &&
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
 * Create a fresh visitor state for a first browser visit.
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
 * Clear active promotion fields while retaining visitor identity markers.
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
    activePromotionKey: promotion.key,
    activeDiscountCode: hasDiscountCode(promotion.discountCode)
      ? String(promotion.discountCode).trim()
      : null,
    promotionActivatedAt: now,
    promotionExpiresAt: now + validityHours * 60 * 60 * 1000,
    popupViewed: false,
    popupDismissed: false,
    popupDismissedAt: null,
    badgeDismissed: false,
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
