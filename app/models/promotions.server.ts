import type { Promotion, PromotionTarget, Prisma } from "@prisma/client";
import prisma from "../db.server";
import { isContextualAudience } from "../promotions/constants";

export type PromotionWithTargets = Promotion & { targets: PromotionTarget[] };

/** Storefront payload — excludes admin-only fields. */
export type StorefrontPromotion = {
  id: string;
  priority: number;
  audienceType: string;
  displayType: string;
  headline: string;
  message: string;
  discountCode: string;
  ctaText: string;
  ctaUrl: string;
  popupDelayMs: number;
  validityHours: number;
  showOnce: boolean;
  dismissalSuppressionHours: number;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  landingPath: string | null;
  minimumCartValue: number | null;
  targets: Array<{
    targetType: string;
    shopifyResourceId: string;
  }>;
};

const cache = new Map<
  string,
  { expiresAt: number; payload: StorefrontPromotion[] }
>();
const CACHE_TTL_MS = 30_000;

export function clearPromotionCache(shop?: string) {
  if (!shop) {
    cache.clear();
    return;
  }
  cache.delete(shop);
}

/**
 * @param {string} shop
 * @param {Date} [now]
 */
export async function listPromotions(shop: string) {
  return prisma.promotion.findMany({
    where: { shop },
    include: { targets: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getPromotion(shop: string, id: string) {
  return prisma.promotion.findFirst({
    where: { shop, id },
    include: { targets: true },
  });
}

export type PromotionInput = {
  name: string;
  enabled?: boolean;
  priority?: number;
  audienceType: string;
  displayType?: string;
  headline?: string;
  message?: string;
  discountCode?: string;
  ctaText?: string;
  ctaUrl?: string;
  popupDelayMs?: number;
  validityHours?: number;
  showOnce?: boolean;
  dismissalSuppressionHours?: number;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  landingPath?: string | null;
  minimumCartValue?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  targets?: Array<{ targetType: string; shopifyResourceId: string }>;
};

function normalizeTargets(
  targets: PromotionInput["targets"] = [],
): Prisma.PromotionTargetCreateWithoutPromotionInput[] {
  return targets
    .filter((t) => t.shopifyResourceId && t.targetType)
    .map((t) => ({
      targetType: t.targetType,
      shopifyResourceId: String(t.shopifyResourceId).trim(),
    }));
}

export async function createPromotion(shop: string, input: PromotionInput) {
  const created = await prisma.promotion.create({
    data: {
      shop,
      name: input.name,
      enabled: Boolean(input.enabled),
      priority: Number(input.priority) || 0,
      audienceType: input.audienceType,
      displayType: input.displayType || "POPUP",
      headline: input.headline || "",
      message: input.message || "",
      discountCode: input.discountCode || "",
      ctaText: input.ctaText || "",
      ctaUrl: input.ctaUrl || "",
      popupDelayMs: Number(input.popupDelayMs) || 1200,
      validityHours: Number(input.validityHours) || 24,
      showOnce: Boolean(input.showOnce),
      dismissalSuppressionHours: Number(input.dismissalSuppressionHours) || 24,
      utmSource: emptyToNull(input.utmSource),
      utmMedium: emptyToNull(input.utmMedium),
      utmCampaign: emptyToNull(input.utmCampaign),
      utmContent: emptyToNull(input.utmContent),
      landingPath: emptyToNull(input.landingPath),
      minimumCartValue:
        input.minimumCartValue == null ||
        input.minimumCartValue === ("" as unknown)
          ? null
          : Number(input.minimumCartValue),
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      targets: { create: normalizeTargets(input.targets) },
    },
    include: { targets: true },
  });
  clearPromotionCache(shop);
  return created;
}

export async function updatePromotion(
  shop: string,
  id: string,
  input: PromotionInput,
) {
  const existing = await getPromotion(shop, id);
  if (!existing) return null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.promotionTarget.deleteMany({ where: { promotionId: id } });
    return tx.promotion.update({
      where: { id },
      data: {
        name: input.name,
        enabled: Boolean(input.enabled),
        priority: Number(input.priority) || 0,
        audienceType: input.audienceType,
        displayType: input.displayType || "POPUP",
        headline: input.headline || "",
        message: input.message || "",
        discountCode: input.discountCode || "",
        ctaText: input.ctaText || "",
        ctaUrl: input.ctaUrl || "",
        popupDelayMs: Number(input.popupDelayMs) || 1200,
        validityHours: Number(input.validityHours) || 24,
        showOnce: Boolean(input.showOnce),
        dismissalSuppressionHours:
          Number(input.dismissalSuppressionHours) || 24,
        utmSource: emptyToNull(input.utmSource),
        utmMedium: emptyToNull(input.utmMedium),
        utmCampaign: emptyToNull(input.utmCampaign),
        utmContent: emptyToNull(input.utmContent),
        landingPath: emptyToNull(input.landingPath),
        minimumCartValue:
          input.minimumCartValue == null ||
          Number.isNaN(Number(input.minimumCartValue))
            ? null
            : Number(input.minimumCartValue),
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        targets: { create: normalizeTargets(input.targets) },
      },
      include: { targets: true },
    });
  });

  clearPromotionCache(shop);
  return updated;
}

export async function setPromotionEnabled(
  shop: string,
  id: string,
  enabled: boolean,
) {
  const result = await prisma.promotion.updateMany({
    where: { shop, id },
    data: { enabled },
  });
  clearPromotionCache(shop);
  return result.count > 0;
}

export async function updatePromotionPriority(
  shop: string,
  id: string,
  priority: number,
) {
  const result = await prisma.promotion.updateMany({
    where: { shop, id },
    data: { priority: Number(priority) || 0 },
  });
  clearPromotionCache(shop);
  return result.count > 0;
}

export async function deletePromotion(shop: string, id: string) {
  const existing = await getPromotion(shop, id);
  if (!existing) return false;
  await prisma.promotion.delete({ where: { id } });
  clearPromotionCache(shop);
  return true;
}

export async function duplicatePromotion(shop: string, id: string) {
  const existing = await getPromotion(shop, id);
  if (!existing) return null;
  return createPromotion(shop, {
    name: `${existing.name} (copy)`,
    enabled: false,
    priority: existing.priority,
    audienceType: existing.audienceType,
    displayType: existing.displayType,
    headline: existing.headline,
    message: existing.message,
    discountCode: existing.discountCode,
    ctaText: existing.ctaText,
    ctaUrl: existing.ctaUrl,
    popupDelayMs: existing.popupDelayMs,
    validityHours: existing.validityHours,
    showOnce: existing.showOnce,
    dismissalSuppressionHours: existing.dismissalSuppressionHours,
    utmSource: existing.utmSource,
    utmMedium: existing.utmMedium,
    utmCampaign: existing.utmCampaign,
    utmContent: existing.utmContent,
    landingPath: existing.landingPath,
    minimumCartValue: existing.minimumCartValue,
    startsAt: existing.startsAt,
    endsAt: existing.endsAt,
    targets: existing.targets.map((t) => ({
      targetType: t.targetType,
      shopifyResourceId: t.shopifyResourceId,
    })),
  });
}

/**
 * Active, scheduled promotions for the storefront (cached briefly).
 */
export async function getActiveStorefrontPromotions(
  shop: string,
  now = new Date(),
): Promise<StorefrontPromotion[]> {
  const cached = cache.get(shop);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const rows = await prisma.promotion.findMany({
    where: {
      shop,
      enabled: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: { targets: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const payload = rows.map(toStorefrontPromotion);
  cache.set(shop, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}

export function toStorefrontPromotion(
  promotion: PromotionWithTargets,
): StorefrontPromotion {
  return {
    id: promotion.id,
    priority: promotion.priority,
    audienceType: promotion.audienceType,
    displayType: promotion.displayType,
    headline: promotion.headline,
    message: promotion.message,
    discountCode: promotion.discountCode,
    ctaText: promotion.ctaText,
    ctaUrl: promotion.ctaUrl,
    popupDelayMs: promotion.popupDelayMs,
    validityHours: promotion.validityHours,
    showOnce: promotion.showOnce,
    dismissalSuppressionHours: promotion.dismissalSuppressionHours,
    utmSource: promotion.utmSource,
    utmMedium: promotion.utmMedium,
    utmCampaign: promotion.utmCampaign,
    utmContent: promotion.utmContent,
    landingPath: promotion.landingPath,
    minimumCartValue: promotion.minimumCartValue,
    targets: promotion.targets.map((t) => ({
      targetType: t.targetType,
      shopifyResourceId: t.shopifyResourceId,
    })),
  };
}

/**
 * Seed the three default promotions for a shop if none exist.
 */
export async function ensureDefaultPromotions(shop: string) {
  const count = await prisma.promotion.count({ where: { shop } });
  if (count > 0) return { created: false, count };

  await createPromotion(shop, {
    name: "First Visit Welcome",
    enabled: false,
    priority: 10,
    audienceType: "FIRST_VISIT",
    headline: "Welcome to Aarla",
    message: "Enjoy 10% off your first order.",
    discountCode: "AARLA10",
    ctaText: "Shop Aarla",
    ctaUrl: "/collections/all",
    validityHours: 24,
    showOnce: true,
    dismissalSuppressionHours: 24,
    popupDelayMs: 1200,
  });

  await createPromotion(shop, {
    name: "Campaign A",
    enabled: false,
    priority: 100,
    audienceType: "UTM_CAMPAIGN",
    headline: "A little something for you",
    message: "Order within the next 24 hours and enjoy this campaign offer.",
    discountCode: "",
    ctaText: "Explore the collection",
    ctaUrl: "/collections/water-bottles",
    utmSource: "meta",
    utmCampaign: "water_bottles",
    validityHours: 24,
    showOnce: false,
    dismissalSuppressionHours: 24,
    popupDelayMs: 1200,
  });

  await createPromotion(shop, {
    name: "Campaign B",
    enabled: false,
    priority: 90,
    audienceType: "UTM_CAMPAIGN",
    headline: "Complete your set",
    message: "Buy an Aarla bottle and enjoy 50% off a bottle bag.",
    discountCode: "",
    ctaText: "Shop bottles",
    ctaUrl: "/collections/water-bottles",
    validityHours: 24,
    showOnce: false,
    dismissalSuppressionHours: 24,
    popupDelayMs: 1200,
  });

  return { created: true, count: 3 };
}

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export { isContextualAudience };
