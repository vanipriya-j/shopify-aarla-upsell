import {
  STORAGE_NAMESPACE,
  clearActivePromotion,
  createVisitorState,
  isFirstTimeVisitor,
} from "./engine.js";

/**
 * @param {Storage | null | undefined} storage
 * @returns {import('./engine.js').VisitorState | null}
 */
export function readVisitorState(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_NAMESPACE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const state = normalizeState(parsed);
    // Empty shells (written before any promo activated) must not block
    // first-visit matching — treat them as absent.
    if (isEmptyVisitorShell(state)) {
      storage.removeItem(STORAGE_NAMESPACE);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {import('./engine.js').VisitorState} state
 */
export function writeVisitorState(storage, state) {
  if (!storage) return;
  storage.setItem(STORAGE_NAMESPACE, JSON.stringify(state));
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearVisitorState(storage) {
  if (!storage) return;
  storage.removeItem(STORAGE_NAMESPACE);
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
  const hasActivatedPromotion =
    Boolean(raw.hasActivatedPromotion) ||
    Boolean(activePromotionKey) ||
    promotionActivatedAt != null ||
    popupViewed ||
    popupDismissed;

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
    !state.activeDiscountCode
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
