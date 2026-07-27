import { beforeEach, describe, expect, it } from "vitest";
import prisma from "../db.server";
import {
  clearPromotionCache,
  createPromotion,
  ensureDefaultPromotions,
  getActiveStorefrontPromotions,
  listPromotions,
} from "./promotions.server";

const SHOP = "test-aarla.myshopify.com";

describe("database-backed promotion retrieval", () => {
  beforeEach(async () => {
    clearPromotionCache();
    await prisma.promotionTarget.deleteMany({
      where: { promotion: { shop: SHOP } },
    });
    await prisma.promotion.deleteMany({ where: { shop: SHOP } });
  });

  it("seeds default promotions and retrieves unlimited records", async () => {
    const seeded = await ensureDefaultPromotions(SHOP);
    expect(seeded.created).toBe(true);

    const listed = await listPromotions(SHOP);
    expect(listed.length).toBe(3);
    expect(listed.some((p) => p.discountCode === "AARLA10")).toBe(true);

    for (let i = 0; i < 5; i += 1) {
      await createPromotion(SHOP, {
        name: `Extra ${i}`,
        enabled: true,
        priority: i,
        audienceType: "UTM_CAMPAIGN",
        utmSource: "meta",
        utmCampaign: `c${i}`,
      });
    }

    const all = await listPromotions(SHOP);
    expect(all.length).toBe(8);
  });

  it("excludes disabled and out-of-schedule promotions from storefront payload", async () => {
    const now = new Date("2026-07-15T12:00:00Z");

    await createPromotion(SHOP, {
      name: "Disabled",
      enabled: false,
      priority: 100,
      audienceType: "FIRST_VISIT",
      headline: "Nope",
    });

    await createPromotion(SHOP, {
      name: "Future",
      enabled: true,
      priority: 90,
      audienceType: "FIRST_VISIT",
      startsAt: new Date("2026-08-01T00:00:00Z"),
    });

    await createPromotion(SHOP, {
      name: "Active",
      enabled: true,
      priority: 50,
      audienceType: "FIRST_VISIT",
      headline: "Hello",
      discountCode: "AARLA10",
      startsAt: new Date("2026-07-01T00:00:00Z"),
      endsAt: new Date("2026-08-01T00:00:00Z"),
      targets: [
        {
          targetType: "QUALIFYING_PRODUCT",
          shopifyResourceId: "gid://shopify/Product/1",
        },
      ],
    });

    const active = await getActiveStorefrontPromotions(SHOP, now);
    expect(active).toHaveLength(1);
    expect(active[0].headline).toBe("Hello");
    expect(active[0].discountCode).toBe("AARLA10");
    expect(active[0].targets).toHaveLength(1);
    expect(active[0]).not.toHaveProperty("shop");
    expect(active[0]).not.toHaveProperty("name");
  });

  it("caches storefront payloads briefly and clears on writes", async () => {
    await createPromotion(SHOP, {
      name: "Cached",
      enabled: true,
      priority: 10,
      audienceType: "FIRST_VISIT",
    });

    const first = await getActiveStorefrontPromotions(SHOP);
    expect(first).toHaveLength(1);

    await prisma.promotion.updateMany({
      where: { shop: SHOP },
      data: { enabled: false },
    });
    const cached = await getActiveStorefrontPromotions(SHOP);
    expect(cached).toHaveLength(1);

    clearPromotionCache(SHOP);
    const refreshed = await getActiveStorefrontPromotions(SHOP);
    expect(refreshed).toHaveLength(0);
  });
});
