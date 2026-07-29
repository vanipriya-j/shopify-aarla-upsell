import {
  STORAGE_NAMESPACE,
  clearActivePromotion,
  createVisitorState,
  isFirstTimeVisitor,
} from "./engine.js";

export const COOKIE_NAMESPACE = "aarla_promotions";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/**
 * @returns {Document | null}
 */
function getDocument() {
  return typeof document !== "undefined" ? document : null;
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
  const fromStorage = readFromLocalStorage(storage);
  if (fromStorage) return fromStorage;
  const fromCookie = readFromCookie();
  // Recover localStorage when only the cookie survived (private mode, quota, etc.).
  if (fromCookie && storage) {
    try {
      storage.setItem(STORAGE_NAMESPACE, JSON.stringify(fromCookie));
    } catch {
      // Ignore storage access errors.
    }
  }
  return fromCookie;
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {import('./engine.js').VisitorState | null}
 */
function readFromLocalStorage(storage) {
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
 * Persist to localStorage and a first-party cookie so show-once survives
 * browsers / embeds where localStorage is flaky.
 * @param {Storage | null | undefined} storage
 * @param {import('./engine.js').VisitorState} state
 */
export function writeVisitorState(storage, state) {
  const payload = JSON.stringify(state);
  if (storage) {
    try {
      storage.setItem(STORAGE_NAMESPACE, payload);
    } catch {
      // Quota / privacy mode — cookie still written below.
    }
  }
  try {
    writeCookie(COOKIE_NAMESPACE, payload);
  } catch {
    // Ignore cookie write failures.
  }
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
  clearCookie(COOKIE_NAMESPACE);
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
