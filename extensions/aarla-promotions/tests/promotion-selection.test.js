import { describe, expect, it } from "vitest";
import {
  activatePromotion,
  buildDiscountUrl,
  clearActivePromotion,
  createVisitorState,
  hasDiscountCode,
  isFirstTimeVisitor,
  matchesLandingPage,
  matchesUtm,
  readUtmParams,
  resolveActivePromotion,
  selectPromotion,
  shouldSuppressPopup,
} from "../src/engine.js";
import {
  createMemoryStorage,
  ensureVisitorState,
  readVisitorState,
  writeVisitorState,
} from "../src/storage.js";
import { evaluatePromotionsForVisit } from "../src/storefront.js";

/**
 * @param {Partial<import('../src/engine.js').PromotionConfig> & { key: import('../src/engine.js').PromotionKey }} overrides
 * @returns {import('../src/engine.js').PromotionConfig}
 */
function promo(overrides) {
  return {
    enabled: true,
    priority: 10,
    headline: "Headline",
    message: "Message",
    discountCode: "CODE",
    ctaText: "Shop",
    ctaDestination: "/collections/all",
    validityHours: 24,
    showOnce: false,
    dismissalSuppressionHours: 24,
    ...overrides,
  };
}

const welcome = promo({
  key: "welcome",
  priority: 10,
  discountCode: "AARLA10",
  headline: "Welcome to Aarla",
});

const campaignA = promo({
  key: "campaign_a",
  priority: 100,
  utmSource: "meta",
  utmCampaign: "water_bottles",
  discountCode: "CAMPAIGNA",
  headline: "Campaign A",
});

const campaignB = promo({
  key: "campaign_b",
  priority: 90,
  utmSource: "meta",
  utmCampaign: "bottle_bags",
  discountCode: "CAMPAIGNB",
  headline: "Campaign B",
});

describe("selectPromotion", () => {
  it("lets campaign promotion override first-time welcome", () => {
    const selected = selectPromotion({
      promotions: [welcome, campaignA],
      utm: readUtmParams("?utm_source=meta&utm_campaign=water_bottles"),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.key).toBe("campaign_a");
  });

  it("picks the higher-priority campaign when both match UTM", () => {
    const bothMeta = [
      campaignA,
      promo({
        ...campaignB,
        utmCampaign: "water_bottles",
        priority: 90,
      }),
    ];
    const selected = selectPromotion({
      promotions: bothMeta,
      utm: readUtmParams("utm_source=Meta&utm_campaign=Water_Bottles"),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.key).toBe("campaign_a");
  });

  it("does not match a disabled promotion", () => {
    const selected = selectPromotion({
      promotions: [{ ...campaignA, enabled: false }, welcome],
      utm: readUtmParams("?utm_source=meta&utm_campaign=water_bottles"),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.key).toBe("welcome");
  });

  it("shows first-time welcome without campaign parameters", () => {
    const selected = selectPromotion({
      promotions: [welcome, campaignA],
      utm: readUtmParams(""),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.key).toBe("welcome");
  });

  it("does not give returning browsers the first-time welcome", () => {
    const selected = selectPromotion({
      promotions: [welcome, campaignA],
      utm: readUtmParams(""),
      currentPath: "/",
      isFirstTimeVisitor: false,
    });
    expect(selected).toBeNull();
  });

  it("matches landing-page promotions when no UTM match exists", () => {
    const landing = promo({
      key: "campaign_b",
      priority: 90,
      landingPagePath: "/collections/water-bottles",
      utmSource: "",
      utmCampaign: "",
    });
    const selected = selectPromotion({
      promotions: [welcome, landing],
      utm: readUtmParams(""),
      currentPath: "/collections/water-bottles/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.key).toBe("campaign_b");
  });
});

describe("UTM matching", () => {
  it("is case-insensitive and trims whitespace; empty fields are ignored", () => {
    expect(
      matchesUtm(
        { ...campaignA, utmMedium: "", utmContent: "  " },
        readUtmParams(
          "?utm_source= Meta &utm_campaign=WATER_BOTTLES&utm_medium=cpc",
        ),
      ),
    ).toBe(true);

    expect(
      matchesUtm(
        campaignA,
        readUtmParams("?utm_source=meta&utm_campaign=other"),
      ),
    ).toBe(false);
  });

  it("does not match when no UTM fields are configured", () => {
    expect(
      matchesUtm(
        promo({ key: "campaign_a", utmSource: "", utmCampaign: "" }),
        readUtmParams("?utm_source=meta"),
      ),
    ).toBe(false);
  });
});

describe("active promotion persistence", () => {
  it("keeps a campaign active after UTM parameters disappear", () => {
    const now = 1_700_000_000_000;
    let state = createVisitorState(now);
    state = activatePromotion(state, campaignA, now);

    const resolution = resolveActivePromotion({
      candidate: selectPromotion({
        promotions: [welcome, campaignA],
        utm: {},
        currentPath: "/products/bottle",
        isFirstTimeVisitor: false,
      }),
      state,
      promotions: [welcome, campaignA],
      now: now + 60_000,
    });

    expect(resolution.action).toBe("keep");
    expect(resolution.promotion?.key).toBe("campaign_a");
  });

  it("clears an expired promotion", () => {
    const now = 1_700_000_000_000;
    let state = activatePromotion(createVisitorState(now), campaignA, now);
    state = {
      ...state,
      promotionExpiresAt: now + 10,
    };

    const resolution = resolveActivePromotion({
      candidate: null,
      state,
      promotions: [campaignA],
      now: now + 11,
    });

    expect(resolution.action).toBe("clear");
    const cleared = clearActivePromotion(state);
    expect(cleared.activePromotionKey).toBeNull();
    expect(cleared.activeDiscountCode).toBeNull();
  });

  it("retains only one active promotion and replaces with higher priority", () => {
    const now = 1_700_000_000_000;
    let state = activatePromotion(createVisitorState(now), campaignB, now);

    const resolution = resolveActivePromotion({
      candidate: campaignA,
      state,
      promotions: [campaignA, campaignB],
      now: now + 1_000,
    });

    expect(resolution.action).toBe("replace");
    expect(resolution.promotion?.key).toBe("campaign_a");

    state = activatePromotion(
      state,
      /** @type {import('../src/engine.js').PromotionConfig} */ (
        resolution.promotion
      ),
      now + 1_000,
    );
    expect(state.activePromotionKey).toBe("campaign_a");
    expect(state.activeDiscountCode).toBe("CAMPAIGNA");
  });

  it("never lets welcome replace an active campaign", () => {
    const now = 1_700_000_000_000;
    const state = activatePromotion(createVisitorState(now), campaignA, now);
    const resolution = resolveActivePromotion({
      candidate: welcome,
      state,
      promotions: [welcome, campaignA],
      now: now + 1_000,
    });
    expect(resolution.action).toBe("keep");
    expect(resolution.promotion?.key).toBe("campaign_a");
  });
});

describe("discount helpers", () => {
  it("builds Shopify discount URLs with encoded code and redirect", () => {
    expect(buildDiscountUrl("AARLA10", "/collections/all")).toBe(
      "/discount/AARLA10?redirect=%2Fcollections%2Fall",
    );
    expect(buildDiscountUrl("SAVE 50%", "/collections/all?sort=best")).toBe(
      "/discount/SAVE%2050%25?redirect=%2Fcollections%2Fall%3Fsort%3Dbest",
    );
  });

  it("treats empty discount codes as absent", () => {
    expect(hasDiscountCode("")).toBe(false);
    expect(hasDiscountCode("   ")).toBe(false);
    expect(hasDiscountCode("AARLA10")).toBe(true);
  });
});

describe("popup suppression", () => {
  it("suppresses reopen when show once is enabled after viewing", () => {
    const now = 1_700_000_000_000;
    let state = activatePromotion(
      createVisitorState(now),
      { ...welcome, showOnce: true },
      now,
    );
    state = { ...state, popupViewed: true };
    expect(
      shouldSuppressPopup(state, { ...welcome, showOnce: true }, now + 1000),
    ).toBe(true);
  });
});

describe("evaluatePromotionsForVisit", () => {
  const baseGlobal = {
    enabled: true,
    testMode: false,
    testPreview: /** @type {const} */ ("automatic"),
    popupDelayMs: 0,
    popupPosition: /** @type {const} */ ("center"),
    popupMaxWidth: 420,
    overlayOpacity: 0.45,
    borderRadius: 12,
    showReminderBadge: true,
    debugLogging: false,
  };

  it("marks first-time visitors and activates welcome", () => {
    const liveStorage = createMemoryStorage();
    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [welcome, campaignA] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_000,
    });
    expect(result.activePromotion?.key).toBe("welcome");
    expect(isFirstTimeVisitor(null)).toBe(true);
    expect(readVisitorState(liveStorage)?.activePromotionKey).toBe("welcome");
  });

  it("does not show welcome for a returning browser", () => {
    const liveStorage = createMemoryStorage();
    ensureVisitorState(liveStorage, 1_700_000_000_000);
    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [welcome] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_100,
    });
    expect(result.activePromotion).toBeNull();
  });

  it("keeps only one active promotion in storage", () => {
    const liveStorage = createMemoryStorage();
    const first = evaluatePromotionsForVisit({
      config: {
        global: baseGlobal,
        promotions: [welcome, campaignA, campaignB],
      },
      liveStorage,
      search: "?utm_source=meta&utm_campaign=bottle_bags",
      pathname: "/",
      now: 1_700_000_000_000,
    });
    expect(first.state.activePromotionKey).toBe("campaign_b");

    const second = evaluatePromotionsForVisit({
      config: {
        global: baseGlobal,
        promotions: [welcome, campaignA, campaignB],
      },
      liveStorage,
      search: "?utm_source=meta&utm_campaign=water_bottles",
      pathname: "/",
      now: 1_700_000_001_000,
    });
    expect(second.state.activePromotionKey).toBe("campaign_a");
    expect(second.state.activeDiscountCode).toBe("CAMPAIGNA");
    const stored = readVisitorState(liveStorage);
    expect(stored?.activePromotionKey).toBe("campaign_a");
    expect(stored?.activeDiscountCode).toBe("CAMPAIGNA");
  });

  it("clears expired promotion on next evaluation", () => {
    const liveStorage = createMemoryStorage();
    const now = 1_700_000_000_000;
    const activated = activatePromotion(
      createVisitorState(now),
      campaignA,
      now,
    );
    writeVisitorState(liveStorage, {
      ...activated,
      promotionExpiresAt: now + 5,
    });

    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [campaignA] },
      liveStorage,
      search: "",
      pathname: "/",
      now: now + 6,
    });
    expect(result.activePromotion).toBeNull();
    expect(readVisitorState(liveStorage)?.activePromotionKey).toBeNull();
  });

  it("does not alter production visitor state during test mode", () => {
    const liveStorage = createMemoryStorage();
    const seed = createVisitorState(1_700_000_000_000);
    writeVisitorState(liveStorage, seed);
    const before = readVisitorState(liveStorage);

    const result = evaluatePromotionsForVisit({
      config: {
        global: { ...baseGlobal, testMode: true, testPreview: "campaign_a" },
        promotions: [welcome, campaignA],
      },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_002_000,
    });

    expect(result.testMode).toBe(true);
    expect(result.activePromotion?.key).toBe("campaign_a");
    expect(readVisitorState(liveStorage)).toEqual(before);
  });

  it("hides code-related controls when discount code is empty", () => {
    const emptyCode = promo({
      key: "campaign_a",
      priority: 100,
      utmSource: "meta",
      utmCampaign: "water_bottles",
      discountCode: "",
    });
    expect(hasDiscountCode(emptyCode.discountCode)).toBe(false);
    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [emptyCode] },
      liveStorage: createMemoryStorage(),
      search: "?utm_source=meta&utm_campaign=water_bottles",
      pathname: "/",
      now: 1_700_000_000_000,
    });
    expect(result.discountUrl).toBeNull();
    expect(result.activePromotion?.discountCode).toBe("");
  });
});

describe("landing page helpers", () => {
  it("normalizes paths for exact matching", () => {
    expect(
      matchesLandingPage(
        promo({
          key: "campaign_a",
          landingPagePath: "collections/water-bottles",
        }),
        "/collections/water-bottles/",
      ),
    ).toBe(true);
  });
});
