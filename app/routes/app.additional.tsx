import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  buildEmbedDeepLink,
  buildForceFirstVisitUrl,
  readCliPreviewThemeId,
} from "../promotions/setup-links.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const shop = session.shop;
  const previewThemeId = readCliPreviewThemeId(shop);

  return {
    shop,
    previewThemeId,
    embedDeepLink: buildEmbedDeepLink(shop, apiKey),
    forceFirstVisitUrl: buildForceFirstVisitUrl(shop, previewThemeId),
  };
};

export default function SetupGuide() {
  const { embedDeepLink, forceFirstVisitUrl, shop, previewThemeId } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Setup guide">
      <s-section heading="1. Enable the theme embed (required)">
        <s-paragraph>
          First-visit popups only render when the app embed is on for the theme
          you are viewing. During <code>shopify app dev</code>, that is usually
          the development preview theme — not the live published theme
          {previewThemeId ? ` (id ${previewThemeId})` : ""}.
        </s-paragraph>
        <s-paragraph>
          <s-link href={embedDeepLink} target="_blank">
            Open theme editor and activate Aarla Promotions
          </s-link>
        </s-paragraph>
        <s-paragraph>
          In the theme editor: App embeds → enable{" "}
          <s-text type="strong">Aarla Promotions</s-text> → Save. Then preview
          the storefront from that same theme editor (or use the CLI preview
          theme URL).
        </s-paragraph>
      </s-section>

      <s-section heading="2. Enable First Visit Welcome">
        <s-paragraph>
          On Promotions, enable the First Visit Welcome row. Leave Campaign A/B
          disabled unless you are testing those UTM/landing rules.
        </s-paragraph>
      </s-section>

      <s-section heading="3. Create the Shopify discount">
        <s-paragraph>
          Create discount code <s-text type="strong">AARLA10</s-text> (or
          whatever code the promotion uses) in Shopify Admin → Discounts. This
          app only displays the code — Shopify owns the actual discount.
        </s-paragraph>
      </s-section>

      <s-section heading="4. Retest first visit">
        <s-paragraph>Open this storefront QA link:</s-paragraph>
        <s-paragraph>
          <s-link href={forceFirstVisitUrl} target="_blank">
            {forceFirstVisitUrl.replace(`https://${shop}`, shop)}
          </s-link>
        </s-paragraph>
        <s-paragraph>
          It targets the preview theme when available, clears the local visit
          marker, and re-triggers first-visit matching. Wait ~1.2s for the
          Welcome popup.
        </s-paragraph>
        <s-paragraph>
          If nothing appears, confirm the embed is enabled and saved on that
          theme, then check the browser Network tab for{" "}
          <code>/apps/aarla-promotions/active</code>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
