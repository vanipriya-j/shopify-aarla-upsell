-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "audienceType" TEXT NOT NULL,
    "displayType" TEXT NOT NULL DEFAULT 'POPUP',
    "headline" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "discountCode" TEXT NOT NULL DEFAULT '',
    "ctaText" TEXT NOT NULL DEFAULT '',
    "ctaUrl" TEXT NOT NULL DEFAULT '',
    "popupDelayMs" INTEGER NOT NULL DEFAULT 1200,
    "validityHours" INTEGER NOT NULL DEFAULT 24,
    "showOnce" BOOLEAN NOT NULL DEFAULT false,
    "dismissalSuppressionHours" INTEGER NOT NULL DEFAULT 24,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "landingPath" TEXT,
    "minimumCartValue" REAL,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromotionTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promotionId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "shopifyResourceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionTarget_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Promotion_shop_enabled_idx" ON "Promotion"("shop", "enabled");

-- CreateIndex
CREATE INDEX "Promotion_shop_priority_idx" ON "Promotion"("shop", "priority");

-- CreateIndex
CREATE INDEX "Promotion_shop_audienceType_idx" ON "Promotion"("shop", "audienceType");

-- CreateIndex
CREATE INDEX "PromotionTarget_promotionId_idx" ON "PromotionTarget"("promotionId");

-- CreateIndex
CREATE INDEX "PromotionTarget_promotionId_targetType_idx" ON "PromotionTarget"("promotionId", "targetType");
