import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  deletePromotion,
  duplicatePromotion,
  ensureDefaultPromotions,
  listPromotions,
  setPromotionEnabled,
  updatePromotionPriority,
} from "../models/promotions.server";
import { AUDIENCE_LABELS } from "../promotions/form";
import {
  buildEmbedDeepLink,
  buildForceFirstVisitUrl,
  readCliPreviewThemeId,
} from "../promotions/setup-links.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await ensureDefaultPromotions(session.shop);
  const promotions = await listPromotions(session.shop);
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const previewThemeId = readCliPreviewThemeId(session.shop);
  return {
    promotions,
    shop: session.shop,
    previewThemeId,
    embedDeepLink: buildEmbedDeepLink(session.shop, apiKey),
    forceFirstVisitUrl: buildForceFirstVisitUrl(
      session.shop,
      previewThemeId,
    ),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const id = String(formData.get("id") || "");

  switch (intent) {
    case "toggle": {
      const enabled = String(formData.get("enabled") || "") === "true";
      await setPromotionEnabled(session.shop, id, enabled);
      break;
    }
    case "priority": {
      await updatePromotionPriority(
        session.shop,
        id,
        Number(formData.get("priority") || 0),
      );
      break;
    }
    case "duplicate": {
      await duplicatePromotion(session.shop, id);
      break;
    }
    case "delete": {
      await deletePromotion(session.shop, id);
      break;
    }
    default:
      break;
  }

  return redirect("/app");
};

export default function PromotionsIndex() {
  const { promotions, embedDeepLink, forceFirstVisitUrl, previewThemeId } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Aarla Promotions">
      <s-button slot="primary-action" href="/app/promotions/new">
        Create promotion
      </s-button>

      <s-section heading="Storefront setup">
        <s-paragraph>
          First visit only works on a theme where the app embed is enabled and
          saved. During local development that is the CLI preview theme, not the
          live published theme
          {previewThemeId ? ` (preview theme ${previewThemeId})` : ""}.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-link href={embedDeepLink} target="_blank">
            Activate theme embed
          </s-link>
          <s-link href={forceFirstVisitUrl} target="_blank">
            Test first visit (one-shot)
          </s-link>
          <s-link href="/app/additional">Full setup guide</s-link>
        </s-stack>
      </s-section>

      <s-section heading="Promotions">
        <s-paragraph>
          Configure unlimited promotions here. The theme app embed only controls
          global popup appearance. Shopify Admin Discounts owns the real
          discount value and eligibility.
        </s-paragraph>

        {promotions.length === 0 ? (
          <s-paragraph>No promotions yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {promotions.map((promotion) => (
              <s-box
                key={promotion.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-heading>{promotion.name}</s-heading>
                    <s-badge tone={promotion.enabled ? "success" : "neutral"}>
                      {promotion.enabled ? "Enabled" : "Disabled"}
                    </s-badge>
                  </s-stack>
                  <s-paragraph>
                    {AUDIENCE_LABELS[promotion.audienceType] ||
                      promotion.audienceType}{" "}
                    · Priority {promotion.priority}
                    {promotion.discountCode
                      ? ` · Code ${promotion.discountCode}`
                      : ""}
                  </s-paragraph>
                  <s-paragraph>{promotion.headline}</s-paragraph>
                  <s-stack direction="inline" gap="base">
                    <Link to={`/app/promotions/${promotion.id}`}>Edit</Link>
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={promotion.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={promotion.enabled ? "false" : "true"}
                      />
                      <button type="submit">
                        {promotion.enabled ? "Disable" : "Enable"}
                      </button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="duplicate" />
                      <input type="hidden" name="id" value={promotion.id} />
                      <button type="submit">Duplicate</button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="priority" />
                      <input type="hidden" name="id" value={promotion.id} />
                      <input
                        type="number"
                        name="priority"
                        defaultValue={promotion.priority}
                        style={{ width: "5rem" }}
                      />
                      <button type="submit">Save priority</button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={promotion.id} />
                      <button type="submit">Delete</button>
                    </Form>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Theme embed">
        <s-paragraph>
          Enable <s-text type="strong">Aarla Promotions</s-text> under App
          embeds, then Save. Opening the normal storefront URL without the
          preview theme will not show the popup while you are running{" "}
          <code>shopify app dev</code>.
        </s-paragraph>
        <s-paragraph>
          <s-link href={embedDeepLink} target="_blank">
            Open App embeds
          </s-link>
        </s-paragraph>
        <s-paragraph>
          Create discount codes in Shopify Admin → Discounts, then reference the
          same code on a promotion.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
