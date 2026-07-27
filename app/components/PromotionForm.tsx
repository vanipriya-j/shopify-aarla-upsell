import { useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { AUDIENCE_TYPES } from "../promotions/constants";
import {
  AUDIENCE_LABELS,
  toDatetimeLocalValue,
  type TargetInput,
} from "../promotions/form";

type PromotionFormValues = {
  name: string;
  enabled: boolean;
  priority: number;
  audienceType: string;
  headline: string;
  message: string;
  discountCode: string;
  ctaText: string;
  ctaUrl: string;
  popupDelayMs: number;
  validityHours: number;
  showOnce: boolean;
  dismissalSuppressionHours: number;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  landingPath: string;
  minimumCartValue: string;
  startsAt: string;
  endsAt: string;
  targets: TargetInput[];
};

const emptyValues: PromotionFormValues = {
  name: "",
  enabled: false,
  priority: 10,
  audienceType: "FIRST_VISIT",
  headline: "",
  message: "",
  discountCode: "",
  ctaText: "",
  ctaUrl: "/collections/all",
  popupDelayMs: 1200,
  validityHours: 24,
  showOnce: false,
  dismissalSuppressionHours: 24,
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmContent: "",
  landingPath: "",
  minimumCartValue: "",
  startsAt: "",
  endsAt: "",
  targets: [],
};

type Props = {
  values?: Partial<
    Omit<
      PromotionFormValues,
      "startsAt" | "endsAt" | "minimumCartValue" | "targets"
    >
  > & {
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
    minimumCartValue?: number | null;
    targets?: TargetInput[];
  };
  submitLabel: string;
};

export function PromotionForm({ values, submitLabel }: Props) {
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const busy = navigation.state !== "idle";

  const initial = useMemo<PromotionFormValues>(() => {
    return {
      ...emptyValues,
      ...values,
      startsAt: toDatetimeLocalValue(values?.startsAt),
      endsAt: toDatetimeLocalValue(values?.endsAt),
      minimumCartValue:
        values?.minimumCartValue == null ? "" : String(values.minimumCartValue),
      targets: values?.targets || [],
      utmSource: values?.utmSource || "",
      utmMedium: values?.utmMedium || "",
      utmCampaign: values?.utmCampaign || "",
      utmContent: values?.utmContent || "",
      landingPath: values?.landingPath || "",
    };
  }, [values]);

  const [audienceType, setAudienceType] = useState(initial.audienceType);
  const [targets, setTargets] = useState<TargetInput[]>(initial.targets);

  async function pickProducts(targetType: string) {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        action: "select",
      });
      if (!selected || !Array.isArray(selected)) return;
      const next = [...targets];
      for (const product of selected) {
        const id = String(product.id);
        if (
          next.some(
            (t) => t.targetType === targetType && t.shopifyResourceId === id,
          )
        ) {
          continue;
        }
        next.push({ targetType, shopifyResourceId: id });
      }
      setTargets(next);
    } catch {
      // Merchant cancelled picker.
    }
  }

  async function pickCollections(targetType: string) {
    try {
      const selected = await shopify.resourcePicker({
        type: "collection",
        multiple: true,
        action: "select",
      });
      if (!selected || !Array.isArray(selected)) return;
      const next = [...targets];
      for (const collection of selected) {
        const id = String(collection.id);
        if (
          next.some(
            (t) => t.targetType === targetType && t.shopifyResourceId === id,
          )
        ) {
          continue;
        }
        next.push({ targetType, shopifyResourceId: id });
      }
      setTargets(next);
    } catch {
      // Merchant cancelled picker.
    }
  }

  function removeTarget(index: number) {
    setTargets((current) => current.filter((_, i) => i !== index));
  }

  const showUtm = audienceType === "UTM_CAMPAIGN";
  const showLanding = audienceType === "LANDING_PAGE";
  const showProductTargets =
    audienceType === "PRODUCT_VIEW" ||
    audienceType === "PRODUCT_IN_CART" ||
    audienceType === "COLLECTION_IN_CART";

  return (
    <Form method="post">
      <s-stack direction="block" gap="base">
        <s-section heading="Basics">
          <s-stack direction="block" gap="base">
            <label>
              Name
              <input name="name" defaultValue={initial.name} required />
            </label>
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={initial.enabled}
              />{" "}
              Enabled
            </label>
            <label>
              Priority (higher wins within the same audience category)
              <input
                type="number"
                name="priority"
                defaultValue={initial.priority}
              />
            </label>
            <label>
              Audience type
              <select
                name="audienceType"
                value={audienceType}
                onChange={(event) => setAudienceType(event.target.value)}
              >
                {AUDIENCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {AUDIENCE_LABELS[type] || type}
                  </option>
                ))}
              </select>
            </label>
          </s-stack>
        </s-section>

        <s-section heading="Presentation">
          <s-stack direction="block" gap="base">
            <label>
              Headline
              <input name="headline" defaultValue={initial.headline} />
            </label>
            <label>
              Message
              <textarea
                name="message"
                defaultValue={initial.message}
                rows={3}
              />
            </label>
            <label>
              Discount code (created in Shopify Admin)
              <input name="discountCode" defaultValue={initial.discountCode} />
            </label>
            <label>
              CTA text
              <input name="ctaText" defaultValue={initial.ctaText} />
            </label>
            <label>
              CTA URL
              <input name="ctaUrl" defaultValue={initial.ctaUrl} />
            </label>
            <label>
              Popup delay (ms)
              <input
                type="number"
                name="popupDelayMs"
                defaultValue={initial.popupDelayMs}
              />
            </label>
          </s-stack>
        </s-section>

        <s-section heading="Frequency & schedule">
          <s-stack direction="block" gap="base">
            <label>
              Validity (hours)
              <input
                type="number"
                name="validityHours"
                defaultValue={initial.validityHours}
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="showOnce"
                defaultChecked={initial.showOnce}
              />{" "}
              Show once
            </label>
            <label>
              Dismissal suppression (hours)
              <input
                type="number"
                name="dismissalSuppressionHours"
                defaultValue={initial.dismissalSuppressionHours}
              />
            </label>
            <label>
              Starts at
              <input
                type="datetime-local"
                name="startsAt"
                defaultValue={initial.startsAt}
              />
            </label>
            <label>
              Ends at
              <input
                type="datetime-local"
                name="endsAt"
                defaultValue={initial.endsAt}
              />
            </label>
          </s-stack>
        </s-section>

        {showUtm && (
          <s-section heading="UTM rules">
            <s-stack direction="block" gap="base">
              <label>
                UTM source
                <input name="utmSource" defaultValue={initial.utmSource} />
              </label>
              <label>
                UTM medium
                <input name="utmMedium" defaultValue={initial.utmMedium} />
              </label>
              <label>
                UTM campaign
                <input name="utmCampaign" defaultValue={initial.utmCampaign} />
              </label>
              <label>
                UTM content
                <input name="utmContent" defaultValue={initial.utmContent} />
              </label>
              <s-paragraph>
                Empty UTM fields are ignored. Matching is case-insensitive.
              </s-paragraph>
            </s-stack>
          </s-section>
        )}

        {showLanding && (
          <s-section heading="Landing page">
            <label>
              Landing path
              <input
                name="landingPath"
                defaultValue={initial.landingPath}
                placeholder="/collections/water-bottles"
              />
            </label>
          </s-section>
        )}

        {showProductTargets && (
          <s-section heading="Product & collection targets">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base">
                <s-button
                  type="button"
                  onClick={() => pickProducts("QUALIFYING_PRODUCT")}
                >
                  Add qualifying products
                </s-button>
                <s-button
                  type="button"
                  onClick={() => pickCollections("QUALIFYING_COLLECTION")}
                >
                  Add qualifying collections
                </s-button>
                <s-button
                  type="button"
                  onClick={() => pickProducts("PROMOTED_PRODUCT")}
                >
                  Add promoted products
                </s-button>
                <s-button
                  type="button"
                  onClick={() => pickCollections("PROMOTED_COLLECTION")}
                >
                  Add promoted collections
                </s-button>
              </s-stack>
              <label>
                Minimum cart value (optional)
                <input
                  type="number"
                  step="0.01"
                  name="minimumCartValue"
                  defaultValue={initial.minimumCartValue}
                />
              </label>
              <s-paragraph>
                Qualifying collections are expanded into product IDs when saved
                so cart matching can use the Ajax Cart API.
              </s-paragraph>
              {targets.length === 0 ? (
                <s-paragraph>No targets selected yet.</s-paragraph>
              ) : (
                <ul>
                  {targets.map((target, index) => (
                    <li
                      key={`${target.targetType}-${target.shopifyResourceId}-${index}`}
                    >
                      <code>{target.targetType}</code>{" "}
                      <code>{target.shopifyResourceId}</code>{" "}
                      <button type="button" onClick={() => removeTarget(index)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </s-stack>
          </s-section>
        )}

        {!showUtm && (
          <>
            <input type="hidden" name="utmSource" value="" />
            <input type="hidden" name="utmMedium" value="" />
            <input type="hidden" name="utmCampaign" value="" />
            <input type="hidden" name="utmContent" value="" />
          </>
        )}
        {!showLanding && <input type="hidden" name="landingPath" value="" />}
        {!showProductTargets && (
          <input type="hidden" name="minimumCartValue" value="" />
        )}

        <input
          type="hidden"
          name="targetsJson"
          value={JSON.stringify(targets)}
        />

        <s-button
          variant="primary"
          type="submit"
          {...(busy ? { loading: true } : {})}
        >
          {submitLabel}
        </s-button>
      </s-stack>
    </Form>
  );
}
