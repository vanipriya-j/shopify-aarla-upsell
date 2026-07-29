import { describe, expect, it, vi } from "vitest";
import {
  activatePromotion,
  applyDiscountCodeToCart,
  buildDiscountUrl,
  clearActivePromotion,
  createVisitorState,
  filterScheduledPromotions,
  hasDiscountCode,
  isFirstTimeVisitor,
  matchesCollectionInCart,
  matchesLandingPage,
  matchesProductInCart,
  matchesProductView,
  matchesUtm,
  readUtmParams,
  resolveActivePromotion,
  selectPromotion,
  shouldSuppressPopup,
} from "../../storefront-engine/engine.js";
import {
  createMemoryStorage,
  ensureVisitorState,
  readVisitorState,
  writeVisitorState,
} from "../../storefront-engine/storage.js";
import {
  evaluatePromotionsForVisit,
  fetchActivePromotions,
} from "../../storefront-engine/storefront.js";

/**
 * @param {Partial<import('../../storefront-engine/engine.js').PromotionConfig> & { id: string }} overrides
 * @returns {import('../../storefront-engine/engine.js').PromotionConfig}
 */
function promo(overrides) {
  return {
    enabled: true,
    priority: 10,
    audienceType: "FIRST_VISIT",
    headline: "Headline",
    message: "Message",
    discountCode: "CODE",
    ctaText: "Shop",
    ctaUrl: "/collections/all",
    validityHours: 24,
    showOnce: false,
    dismissalSuppressionHours: 24,
    targets: [],
    ...overrides,
  };
}

const welcome = promo({
  id: "welcome",
  key: "welcome",
  audienceType: "FIRST_VISIT",
  priority: 10,
  discountCode: "AARLA10",
  headline: "Welcome to Aarla",
});

const campaignA = promo({
  id: "campaign_a",
  key: "campaign_a",
  audienceType: "UTM_CAMPAIGN",
  priority: 100,
  utmSource: "meta",
  utmCampaign: "water_bottles",
  discountCode: "CAMPAIGNA",
  headline: "Campaign A",
});

const campaignB = promo({
  id: "campaign_b",
  key: "campaign_b",
  audienceType: "UTM_CAMPAIGN",
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
    expect(selected?.id).toBe("campaign_a");
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
    expect(selected?.id).toBe("campaign_a");
  });

  it("does not match a disabled promotion", () => {
    const selected = selectPromotion({
      promotions: [{ ...campaignA, enabled: false }, welcome],
      utm: readUtmParams("?utm_source=meta&utm_campaign=water_bottles"),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.id).toBe("welcome");
  });

  it("shows first-time welcome without campaign parameters", () => {
    const selected = selectPromotion({
      promotions: [welcome, campaignA],
      utm: readUtmParams(""),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.id).toBe("welcome");
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
      id: "campaign_b",
      key: "campaign_b",
      audienceType: "LANDING_PAGE",
      priority: 90,
      landingPath: "/collections/water-bottles",
      utmSource: "",
      utmCampaign: "",
    });
    const selected = selectPromotion({
      promotions: [welcome, landing],
      utm: readUtmParams(""),
      currentPath: "/collections/water-bottles/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.id).toBe("campaign_b");
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
        promo({
          id: "campaign_a",
          audienceType: "UTM_CAMPAIGN",
          utmSource: "",
          utmCampaign: "",
        }),
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
    expect(resolution.promotion?.id).toBe("campaign_a");
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
    expect(resolution.promotion?.id).toBe("campaign_a");

    state = activatePromotion(
      state,
      /** @type {import('../../storefront-engine/engine.js').PromotionConfig} */ (
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
    expect(resolution.promotion?.id).toBe("campaign_a");
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
    expect(buildDiscountUrl("AARLA10", "")).toBe(
      "/discount/AARLA10?redirect=%2Fcart",
    );
  });

  it("treats empty discount codes as absent", () => {
    expect(hasDiscountCode("")).toBe(false);
    expect(hasDiscountCode("   ")).toBe(false);
    expect(hasDiscountCode("AARLA10")).toBe(true);
  });

  it("applies discount codes through cart/update.js and reads applicable", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        discount_codes: [{ code: "AARLA10", applicable: true }],
      }),
    }));
    const result = await applyDiscountCodeToCart("AARLA10", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/cart/update.js",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ discount: "AARLA10" }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.applicable).toBe(true);

    const notApplicable = await applyDiscountCodeToCart("AARLA10", async () => ({
      ok: true,
      json: async () => ({
        discount_codes: [{ code: "AARLA10", applicable: false }],
      }),
    }));
    expect(notApplicable.applicable).toBe(false);
    expect(notApplicable.error).toBe("not_applicable");
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
    expect(result.activePromotion?.id).toBe("welcome");
    expect(isFirstTimeVisitor(null)).toBe(true);
    expect(readVisitorState(liveStorage)?.activePromotionKey).toBe("welcome");
  });

  it("does not show welcome for a returning browser", () => {
    const liveStorage = createMemoryStorage();
    // Returning = previously activated a promotion (not merely an empty shell).
    const prior = activatePromotion(
      createVisitorState(1_700_000_000_000),
      campaignA,
      1_700_000_000_000,
    );
    writeVisitorState(liveStorage, clearActivePromotion(prior));
    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [welcome] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_100,
    });
    expect(result.activePromotion).toBeNull();
  });

  it("still treats empty leftover visit markers as first visit", () => {
    const liveStorage = createMemoryStorage();
    // Older builds wrote a visit marker even when no promo activated.
    ensureVisitorState(liveStorage, 1_700_000_000_000);
    expect(liveStorage.getItem("aarla_promotions")).toBeTruthy();

    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [welcome] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_100,
    });
    expect(result.activePromotion?.id).toBe("welcome");
  });

  it("does not persist localStorage when no promotion matches on first visit", () => {
    const liveStorage = createMemoryStorage();
    const result = evaluatePromotionsForVisit({
      config: {
        global: baseGlobal,
        promotions: [{ ...welcome, enabled: false }],
      },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_000,
    });
    expect(result.activePromotion).toBeNull();
    expect(liveStorage.getItem("aarla_promotions")).toBeNull();

    // A later visit with welcome enabled should still count as first visit.
    const second = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [welcome] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_100,
    });
    expect(second.activePromotion?.id).toBe("welcome");
  });

  it("persists database promotion IDs across page loads", () => {
    const liveStorage = createMemoryStorage();
    const dbWelcome = promo({
      id: "cms372cxo0000jsuxml5uk85t",
      audienceType: "FIRST_VISIT",
      discountCode: "AARLA10",
      showOnce: true,
    });
    const first = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [dbWelcome] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_000,
    });
    expect(first.state.activePromotionKey).toBe("cms372cxo0000jsuxml5uk85t");
    expect(readVisitorState(liveStorage)?.activePromotionKey).toBe(
      "cms372cxo0000jsuxml5uk85t",
    );

    // Simulate popup viewed (showOnce) then reload.
    writeVisitorState(liveStorage, {
      .../** @type {NonNullable<ReturnType<typeof readVisitorState>>} */ (
        readVisitorState(liveStorage)
      ),
      popupViewed: true,
    });

    const second = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [dbWelcome] },
      liveStorage,
      search: "",
      pathname: "/",
      now: 1_700_000_000_100,
    });
    expect(second.activePromotion?.id).toBe("cms372cxo0000jsuxml5uk85t");
    expect(second.suppressPopup).toBe(true);
    expect(readVisitorState(liveStorage)?.activePromotionKey).toBe(
      "cms372cxo0000jsuxml5uk85t",
    );
  });

  it("re-triggers first visit when aarla_force_first_visit=1", () => {
    const liveStorage = createMemoryStorage();
    const prior = activatePromotion(
      createVisitorState(1_700_000_000_000),
      campaignA,
      1_700_000_000_000,
    );
    writeVisitorState(liveStorage, {
      ...prior,
      popupViewed: true,
    });

    const result = evaluatePromotionsForVisit({
      config: { global: baseGlobal, promotions: [welcome] },
      liveStorage,
      search: "?aarla_force_first_visit=1",
      pathname: "/",
      now: 1_700_000_000_200,
    });
    expect(result.activePromotion?.id).toBe("welcome");
    expect(result.suppressPopup).toBe(false);
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
    expect(result.activePromotion?.id).toBe("campaign_a");
    expect(readVisitorState(liveStorage)).toEqual(before);
  });

  it("hides code-related controls when discount code is empty", () => {
    const emptyCode = promo({
      id: "campaign_a",
      audienceType: "UTM_CAMPAIGN",
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
          id: "campaign_a",
          audienceType: "LANDING_PAGE",
          landingPath: "collections/water-bottles",
        }),
        "/collections/water-bottles/",
      ),
    ).toBe(true);
  });
});

describe("product and cart matching", () => {
  it("matches product-view promotions by product or variant targets", () => {
    const productPromo = promo({
      id: "pv1",
      audienceType: "PRODUCT_VIEW",
      priority: 80,
      targets: [
        {
          targetType: "QUALIFYING_PRODUCT",
          shopifyResourceId: "gid://shopify/Product/111",
        },
      ],
    });
    expect(
      matchesProductView(productPromo, "gid://shopify/Product/111", null),
    ).toBe(true);
    expect(matchesProductView(productPromo, "111", null)).toBe(true);
    expect(
      matchesProductView(productPromo, "gid://shopify/Product/999", null),
    ).toBe(false);

    const selected = selectPromotion({
      promotions: [welcome, productPromo],
      utm: {},
      currentPath: "/products/bottle",
      isFirstTimeVisitor: true,
      productId: "gid://shopify/Product/111",
    });
    expect(selected?.id).toBe("pv1");
  });

  it("matches product-in-cart using Ajax cart line items", () => {
    const cartPromo = promo({
      id: "cart1",
      audienceType: "PRODUCT_IN_CART",
      priority: 85,
      targets: [
        {
          targetType: "QUALIFYING_PRODUCT",
          shopifyResourceId: "gid://shopify/Product/222",
        },
      ],
    });
    expect(
      matchesProductInCart(cartPromo, [
        { product_id: 222, variant_id: 1, final_line_price: 2000 },
      ]),
    ).toBe(true);
    expect(
      matchesProductInCart(cartPromo, [
        { product_id: 999, variant_id: 1, final_line_price: 2000 },
      ]),
    ).toBe(false);
  });

  it("matches collection-in-cart via expanded qualifying product IDs", () => {
    const collectionPromo = promo({
      id: "col1",
      audienceType: "COLLECTION_IN_CART",
      priority: 70,
      targets: [
        {
          targetType: "QUALIFYING_COLLECTION",
          shopifyResourceId: "gid://shopify/Collection/1",
        },
        {
          targetType: "QUALIFYING_PRODUCT",
          shopifyResourceId: "gid://shopify/Product/333",
        },
      ],
    });
    expect(
      matchesCollectionInCart(collectionPromo, [{ product_id: 333 }]),
    ).toBe(true);
  });
});

describe("unlimited campaigns and priority", () => {
  it("supports multiple / unlimited campaign records with priority resolution", () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      promo({
        id: `utm_${index}`,
        audienceType: "UTM_CAMPAIGN",
        priority: index,
        utmSource: "meta",
        utmCampaign: "shared",
      }),
    );
    const selected = selectPromotion({
      promotions: many,
      utm: readUtmParams("?utm_source=meta&utm_campaign=shared"),
      currentPath: "/",
      isFirstTimeVisitor: true,
    });
    expect(selected?.id).toBe("utm_24");
  });

  it("prefers UTM over landing over product context over returning over first visit", () => {
    const promotions = [
      promo({
        id: "first",
        audienceType: "FIRST_VISIT",
        priority: 999,
      }),
      promo({
        id: "returning",
        audienceType: "RETURNING_VISITOR",
        priority: 999,
      }),
      promo({
        id: "product",
        audienceType: "PRODUCT_VIEW",
        priority: 999,
        targets: [
          {
            targetType: "QUALIFYING_PRODUCT",
            shopifyResourceId: "gid://shopify/Product/1",
          },
        ],
      }),
      promo({
        id: "landing",
        audienceType: "LANDING_PAGE",
        priority: 999,
        landingPath: "/collections/all",
      }),
      promo({
        id: "utm",
        audienceType: "UTM_CAMPAIGN",
        priority: 1,
        utmSource: "meta",
        utmCampaign: "x",
      }),
    ];

    expect(
      selectPromotion({
        promotions,
        utm: readUtmParams("?utm_source=meta&utm_campaign=x"),
        currentPath: "/collections/all",
        isFirstTimeVisitor: true,
        productId: "gid://shopify/Product/1",
      })?.id,
    ).toBe("utm");

    expect(
      selectPromotion({
        promotions: promotions.filter((p) => p.id !== "utm"),
        utm: {},
        currentPath: "/collections/all",
        isFirstTimeVisitor: false,
        isReturningVisitor: true,
        productId: "gid://shopify/Product/1",
      })?.id,
    ).toBe("landing");
  });
});

describe("schedule and API fallback", () => {
  it("excludes scheduled promotions outside their window", () => {
    const now = Date.parse("2026-07-01T12:00:00Z");
    const future = promo({
      id: "future",
      audienceType: "FIRST_VISIT",
      enabled: true,
      startsAt: "2026-08-01T00:00:00Z",
    });
    const past = promo({
      id: "past",
      audienceType: "FIRST_VISIT",
      enabled: true,
      endsAt: "2026-06-01T00:00:00Z",
    });
    const active = promo({
      id: "active",
      audienceType: "FIRST_VISIT",
      enabled: true,
      startsAt: "2026-06-01T00:00:00Z",
      endsAt: "2026-08-01T00:00:00Z",
    });
    const filtered = filterScheduledPromotions([future, past, active], now);
    expect(filtered.map((p) => p.id)).toEqual(["active"]);
  });

  it("returns an empty list when the promotions API fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      fetchActivePromotions("/apps/aarla-promotions/active", fetchImpl),
    ).resolves.toEqual([]);
  });

  it("returns an empty list when the promotions API is unavailable", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({}),
    }));
    await expect(
      fetchActivePromotions("/apps/aarla-promotions/active", fetchImpl),
    ).resolves.toEqual([]);
  });

  it("enforces one active promotion even with many matches available", () => {
    const liveStorage = createMemoryStorage();
    const many = [
      campaignA,
      campaignB,
      welcome,
      promo({
        id: "extra",
        audienceType: "UTM_CAMPAIGN",
        priority: 50,
        utmSource: "meta",
        utmCampaign: "water_bottles",
      }),
    ];
    const result = evaluatePromotionsForVisit({
      config: {
        global: {
          enabled: true,
          testMode: false,
          testPreview: "automatic",
          popupDelayMs: 0,
          popupPosition: "center",
          popupMaxWidth: 420,
          overlayOpacity: 0.45,
          borderRadius: 12,
          showReminderBadge: true,
          debugLogging: false,
        },
        promotions: many,
      },
      liveStorage,
      search: "?utm_source=meta&utm_campaign=water_bottles",
      pathname: "/",
      now: 1_700_000_000_000,
    });
    expect(result.state.activePromotionKey).toBe("campaign_a");
    expect(result.activePromotion?.discountCode).toBe("CAMPAIGNA");
  });
});

describe("shouldForceFirstVisit", () => {
  it("detects force query values", async () => {
    const { shouldForceFirstVisit } = await import(
      "../../storefront-engine/storefront.js"
    );
    expect(shouldForceFirstVisit("?aarla_force_first_visit=1")).toBe(true);
    expect(shouldForceFirstVisit("?aarla_force_first_visit=true")).toBe(true);
    expect(shouldForceFirstVisit("")).toBe(false);
    expect(shouldForceFirstVisit("?utm_source=meta")).toBe(false);
  });
});
