/**
 * Shared promotion audience / target constants used by admin + tests.
 */

export const AUDIENCE_TYPES = /** @type {const} */ [
  "FIRST_VISIT",
  "RETURNING_VISITOR",
  "UTM_CAMPAIGN",
  "LANDING_PAGE",
  "PRODUCT_VIEW",
  "PRODUCT_IN_CART",
  "COLLECTION_IN_CART",
];

export const DISPLAY_TYPES = /** @type {const} */ ["POPUP"];

export const TARGET_TYPES = /** @type {const} */ [
  "QUALIFYING_PRODUCT",
  "QUALIFYING_VARIANT",
  "QUALIFYING_COLLECTION",
  "PROMOTED_PRODUCT",
  "PROMOTED_VARIANT",
  "PROMOTED_COLLECTION",
];

/** Matching category order (first match category wins). */
export const AUDIENCE_MATCH_ORDER = /** @type {const} */ [
  "UTM_CAMPAIGN",
  "LANDING_PAGE",
  "PRODUCT_VIEW",
  "PRODUCT_IN_CART",
  "COLLECTION_IN_CART",
  "RETURNING_VISITOR",
  "FIRST_VISIT",
];

/**
 * Contextual / campaign-like audiences that first-visit must not replace.
 */
export function isContextualAudience(audienceType: string) {
  return (
    audienceType === "UTM_CAMPAIGN" ||
    audienceType === "LANDING_PAGE" ||
    audienceType === "PRODUCT_VIEW" ||
    audienceType === "PRODUCT_IN_CART" ||
    audienceType === "COLLECTION_IN_CART"
  );
}
