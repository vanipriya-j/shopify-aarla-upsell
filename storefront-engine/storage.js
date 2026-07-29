import {
  STORAGE_NAMESPACE,
  clearActivePromotion,
  createVisitorState,
  isFirstTimeVisitor,
} from "./engine.js";

export const COOKIE_NAMESPACE = "aarla_promotions";
/** Compact cookie — full JSON often fails silently when Shopify's jar is full. */
export const VIEWED_COOKIE_NAMESPACE = "aarla_pv";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/**
 * @returns {Document | null}
 */
function getDocument() {
  return typeof document !== "undefined" ? document : null;
}

/**
 * @returns {Storage | null}
 */
function getSessionStorage() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * @param {string} name
 * @returns {string | null}
 */
export function readCookie(name) {
  const doc = getDocument();
  if (!doc?.cookie) return null;
  const parts = doc.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return null;
}

/**
 * @param {string} name
 * @param {string} value
 * @param {number} [maxAgeSeconds]
 */
export function writeCookie(name, value, maxAgeSeconds = COOKIE_MAX_AGE_SECONDS) {
  const doc = getDocument();
  if (!doc) return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  doc.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

/**
 * @param {string} name
 */
export function clearCookie(name) {
  const doc = getDocument();
  if (!doc) return;
  doc.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {import('./engine.js').VisitorState | null}
 */
export function readVisitorState(storage) {
  const fromLocal = readFromWebStorage(storage);
  if (fromLocal) return fromLocal;

  const fromSession = readFromWebStorage(getSessionStorage());
  if (fromSession) {
    // Recover localStorage / cookies from sessionStorage.
    writeVisitorState(storage, fromSession);
    return fromSession;
  }

  const fromCookie = readFromCookie();
  if (fromCookie) {
    writeVisitorState(storage, fromCookie);
    return fromCookie;
  }

  const fromViewedCookie = readFromViewedCookie();
  if (fromViewedCookie) {
    writeVisitorState(storage, fromViewedCookie);
    return fromViewedCookie;
  }

  return null;
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {import('./engine.js').VisitorState | null}
 */
function readFromWebStorage(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_NAMESPACE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const state = normalizeState(parsed);
    if (isEmptyVisitorShell(state)) {
      try {
        storage.removeItem(STORAGE_NAMESPACE);
      } catch {
        // Ignore storage access errors.
      }
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * @returns {import('./engine.js').VisitorState | null}
 */
function readFromCookie() {
  try {
    const raw = readCookie(COOKIE_NAMESPACE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const state = normalizeState(parsed);
    if (isEmptyVisitorShell(state)) {
      clearCookie(COOKIE_NAMESPACE);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Compact cookie format: `visitorId|id1,id2|activeId|expiresAt|dismissedAt`
 * @returns {import('./engine.js').VisitorState | null}
 */
function readFromViewedCookie() {
  try {
    const raw = readCookie(VIEWED_COOKIE_NAMESPACE);
    if (!raw) return null;
    const parts = raw.split("|");
    const visitorId = parts[0] || createFallbackId();
    const viewedPromotionKeys = (parts[1] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const activePromotionKey = normalizeKey(parts[2] || null);
    const promotionExpiresAt = nullableNumber(parts[3] || null);
    const popupDismissedAt = nullableNumber(parts[4] || null);
    if (
      viewedPromotionKeys.length === 0 &&
      !activePromotionKey &&
      popupDismissedAt == null
    ) {
      return null;
    }
    const now = Date.now();
    return normalizeState({
      visitorId,
      firstVisitAt: now,
      lastVisitAt: now,
      activePromotionKey,
      activeDiscountCode: null,
      promotionActivatedAt: activePromotionKey ? now : null,
      promotionExpiresAt,
      popupViewed: viewedPromotionKeys.length > 0,
      popupDismissed: popupDismissedAt != null,
      popupDismissedAt,
      badgeDismissed: false,
      hasActivatedPromotion: true,
      viewedPromotionKeys,
    });
  } catch {
    return null;
  }
}

/**
 * Persist to localStorage, sessionStorage, full cookie (best effort), and a
 * compact viewed cookie that survives when Shopify's cookie jar is nearly full.
 * @param {Storage | null | undefined} storage
 * @param {import('./engine.js').VisitorState} state
 */
export function writeVisitorState(storage, state) {
  const payload = JSON.stringify(state);
  if (storage) {
    try {
      storage.setItem(STORAGE_NAMESPACE, payload);
    } catch {
      // Quota / privacy mode.
    }
  }
  const session = getSessionStorage();
  if (session) {
    try {
      session.setItem(STORAGE_NAMESPACE, payload);
    } catch {
      // Ignore.
    }
  }
  try {
    writeCookie(COOKIE_NAMESPACE, payload);
  } catch {
    // Ignore cookie write failures.
  }
  try {
    writeViewedCookie(state);
  } catch {
    // Ignore.
  }
}

/**
 * @param {import('./engine.js').VisitorState} state
 */
function writeViewedCookie(state) {
  const viewed = Array.isArray(state.viewedPromotionKeys)
    ? state.viewedPromotionKeys.filter(Boolean).join(",")
    : "";
  const active = state.activePromotionKey || "";
  const expires =
    state.promotionExpiresAt != null ? String(state.promotionExpiresAt) : "";
  const dismissed =
    state.popupDismissedAt != null ? String(state.popupDismissedAt) : "";
  const compact = [
    state.visitorId || createFallbackId(),
    viewed,
    active,
    expires,
    dismissed,
  ].join("|");
  writeCookie(VIEWED_COOKIE_NAMESPACE, compact);
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearVisitorState(storage) {
  if (storage) {
    try {
      storage.removeItem(STORAGE_NAMESPACE);
    } catch {
      // Ignore.
    }
  }
  const session = getSessionStorage();
  if (session) {
    try {
      session.removeItem(STORAGE_NAMESPACE);
    } catch {
      // Ignore.
    }
  }
  clearCookie(COOKIE_NAMESPACE);
  clearCookie(VIEWED_COOKIE_NAMESPACE);
}

/**
 * Ensure visit timestamps exist. Does not invent a first-time marker when
 * storage is empty — callers should use ensureVisitorState for that.
 * @param {import('./engine.js').VisitorState} state
 * @param {number} [now]
 * @returns {import('./engine.js').VisitorState}
 */
export function touchVisitorState(state, now = Date.now()) {
  return {
    ...state,
    lastVisitAt: now,
  };
}

/**
 * Load or create visitor state. Creating state marks the browser as visited.
 * @param {Storage | null | undefined} storage
 * @param {number} [now]
 * @returns {{ state: import('./engine.js').VisitorState, isFirstVisit: boolean }}
 */
export function ensureVisitorState(storage, now = Date.now()) {
  const existing = readVisitorState(storage);
  const firstVisit = isFirstTimeVisitor(existing);
  if (firstVisit) {
    const state = createVisitorState(now);
    writeVisitorState(storage, state);
    return { state, isFirstVisit: true };
  }
  const state = touchVisitorState(
    /** @type {import('./engine.js').VisitorState} */ (existing),
    now,
  );
  writeVisitorState(storage, state);
  return { state, isFirstVisit: false };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {import('./engine.js').VisitorState}
 */
function normalizeState(raw) {
  const activePromotionKey = normalizeKey(raw.activePromotionKey);
  const promotionActivatedAt = nullableNumber(raw.promotionActivatedAt);
  const popupViewed = Boolean(raw.popupViewed);
  const popupDismissed = Boolean(raw.popupDismissed);
  const viewedPromotionKeys = Array.isArray(raw.viewedPromotionKeys)
    ? raw.viewedPromotionKeys
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const hasActivatedPromotion =
    Boolean(raw.hasActivatedPromotion) ||
    Boolean(activePromotionKey) ||
    promotionActivatedAt != null ||
    popupViewed ||
    popupDismissed ||
    viewedPromotionKeys.length > 0;

  return {
    visitorId:
      typeof raw.visitorId === "string" ? raw.visitorId : createFallbackId(),
    firstVisitAt: numberOr(raw.firstVisitAt, Date.now()),
    lastVisitAt: numberOr(raw.lastVisitAt, Date.now()),
    activePromotionKey,
    activeDiscountCode:
      typeof raw.activeDiscountCode === "string" &&
      raw.activeDiscountCode.trim()
        ? raw.activeDiscountCode.trim()
        : null,
    promotionActivatedAt,
    promotionExpiresAt: nullableNumber(raw.promotionExpiresAt),
    popupViewed,
    popupDismissed,
    popupDismissedAt: nullableNumber(raw.popupDismissedAt),
    badgeDismissed: Boolean(raw.badgeDismissed),
    hasActivatedPromotion,
    viewedPromotionKeys,
  };
}

/**
 * Accept legacy keys and database promotion IDs.
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Visit marker with no activation history — leftover from older builds that
 * wrote localStorage on every page load before a promo matched.
 * @param {import('./engine.js').VisitorState} state
 */
function isEmptyVisitorShell(state) {
  return (
    !state.hasActivatedPromotion &&
    state.activePromotionKey == null &&
    state.promotionActivatedAt == null &&
    !state.popupViewed &&
    !state.popupDismissed &&
    !state.activeDiscountCode &&
    !(
      Array.isArray(state.viewedPromotionKeys) &&
      state.viewedPromotionKeys.length > 0
    )
  );
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function nullableNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function createFallbackId() {
  return `aarla_${Date.now().toString(36)}`;
}

/**
 * In-memory storage used by test mode so live visitor state is untouched.
 * @returns {Storage}
 */
export function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? /** @type {string} */ (map.get(key)) : null;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
  };
}

/**
 * @param {import('./engine.js').VisitorState} state
 * @returns {import('./engine.js').VisitorState}
 */
export function expireActivePromotion(state) {
  return clearActivePromotion(state);
}
