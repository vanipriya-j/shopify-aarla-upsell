import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds the default Aarla promotions for a shop.
 * Usage: SEED_SHOP=your-store.myshopify.com npm run seed
 */
async function main() {
  const shop = process.env.SEED_SHOP || "aarla.myshopify.com";

  const existing = await prisma.promotion.count({ where: { shop } });
  if (existing > 0) {
    console.log(`Shop ${shop} already has ${existing} promotion(s); skipping seed.`);
    return;
  }

  await prisma.promotion.create({
    data: {
      shop,
      name: "First Visit Welcome",
      enabled: false,
      priority: 10,
      audienceType: "FIRST_VISIT",
      displayType: "POPUP",
      headline: "Welcome to Aarla",
      message: "Enjoy 10% off your first order.",
      discountCode: "AARLA10",
      ctaText: "Shop Aarla",
      ctaUrl: "/collections/all",
      popupDelayMs: 1200,
      validityHours: 24,
      showOnce: true,
      dismissalSuppressionHours: 24,
    },
  });

  await prisma.promotion.create({
    data: {
      shop,
      name: "Campaign A",
      enabled: false,
      priority: 100,
      audienceType: "UTM_CAMPAIGN",
      displayType: "POPUP",
      headline: "A little something for you",
      message: "Order within the next 24 hours and enjoy this campaign offer.",
      discountCode: "",
      ctaText: "Explore the collection",
      ctaUrl: "/collections/water-bottles",
      utmSource: "meta",
      utmCampaign: "water_bottles",
      popupDelayMs: 1200,
      validityHours: 24,
      showOnce: false,
      dismissalSuppressionHours: 24,
    },
  });

  await prisma.promotion.create({
    data: {
      shop,
      name: "Campaign B",
      enabled: false,
      priority: 90,
      audienceType: "UTM_CAMPAIGN",
      displayType: "POPUP",
      headline: "Complete your set",
      message: "Buy an Aarla bottle and enjoy 50% off a bottle bag.",
      discountCode: "",
      ctaText: "Shop bottles",
      ctaUrl: "/collections/water-bottles",
      popupDelayMs: 1200,
      validityHours: 24,
      showOnce: false,
      dismissalSuppressionHours: 24,
    },
  });

  console.log(`Seeded 3 default promotions for ${shop}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
