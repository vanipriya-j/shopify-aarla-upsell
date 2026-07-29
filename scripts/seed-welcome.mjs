import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const shop = process.argv[2] || "aarla-dev.myshopify.com";

async function main() {
  const existing = await prisma.promotion.findMany({ where: { shop } });
  console.log("existing", existing.length);

  if (existing.length === 0) {
    await prisma.promotion.create({
      data: {
        shop,
        name: "First Visit Welcome",
        enabled: true,
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
    console.log("created First Visit Welcome (enabled)");
  } else {
    const updated = await prisma.promotion.updateMany({
      where: { shop, audienceType: "FIRST_VISIT" },
      data: { enabled: true },
    });
    console.log("enabled FIRST_VISIT rows", updated.count);
  }

  console.log(
    await prisma.promotion.findMany({
      where: { shop },
      select: {
        id: true,
        name: true,
        enabled: true,
        audienceType: true,
      },
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
