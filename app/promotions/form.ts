import type { PromotionTarget } from "@prisma/client";
import { AUDIENCE_TYPES } from "../promotions/constants";

export type TargetInput = { targetType: string; shopifyResourceId: string };

export function parsePromotionForm(formData: FormData) {
  const audienceType = String(formData.get("audienceType") || "FIRST_VISIT");
  if (
    !AUDIENCE_TYPES.includes(audienceType as (typeof AUDIENCE_TYPES)[number])
  ) {
    throw new Error("Invalid audience type");
  }

  const startsAtRaw = String(formData.get("startsAt") || "").trim();
  const endsAtRaw = String(formData.get("endsAt") || "").trim();
  const minCartRaw = String(formData.get("minimumCartValue") || "").trim();

  const targets = parseTargetsField(
    String(formData.get("targetsJson") || "[]"),
  );

  return {
    name: String(formData.get("name") || "Untitled promotion").trim(),
    enabled:
      formData.get("enabled") === "on" || formData.get("enabled") === "true",
    priority: Number(formData.get("priority") || 0),
    audienceType,
    displayType: "POPUP",
    headline: String(formData.get("headline") || ""),
    message: String(formData.get("message") || ""),
    discountCode: String(formData.get("discountCode") || "").trim(),
    ctaText: String(formData.get("ctaText") || ""),
    ctaUrl: String(formData.get("ctaUrl") || ""),
    popupDelayMs: Number(formData.get("popupDelayMs") || 1200),
    validityHours: Number(formData.get("validityHours") || 24),
    showOnce:
      formData.get("showOnce") === "on" || formData.get("showOnce") === "true",
    dismissalSuppressionHours: Number(
      formData.get("dismissalSuppressionHours") || 24,
    ),
    utmSource: String(formData.get("utmSource") || "") || null,
    utmMedium: String(formData.get("utmMedium") || "") || null,
    utmCampaign: String(formData.get("utmCampaign") || "") || null,
    utmContent: String(formData.get("utmContent") || "") || null,
    landingPath: String(formData.get("landingPath") || "") || null,
    minimumCartValue: minCartRaw === "" ? null : Number(minCartRaw),
    startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    endsAt: endsAtRaw ? new Date(endsAtRaw) : null,
    targets,
  };
}

export function parseTargetsField(raw: string): TargetInput[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.targetType === "string" &&
          typeof item.shopifyResourceId === "string",
      )
      .map((item) => ({
        targetType: item.targetType,
        shopifyResourceId: item.shopifyResourceId,
      }));
  } catch {
    return [];
  }
}

export function targetsToJson(targets: PromotionTarget[] | TargetInput[]) {
  return JSON.stringify(
    targets.map((t) => ({
      targetType: t.targetType,
      shopifyResourceId: t.shopifyResourceId,
    })),
  );
}

export function toDatetimeLocalValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const AUDIENCE_LABELS: Record<string, string> = {
  FIRST_VISIT: "First visit",
  RETURNING_VISITOR: "Returning visitor",
  UTM_CAMPAIGN: "UTM campaign",
  LANDING_PAGE: "Landing page",
  PRODUCT_VIEW: "Product view",
  PRODUCT_IN_CART: "Product in cart",
  COLLECTION_IN_CART: "Collection in cart",
};
