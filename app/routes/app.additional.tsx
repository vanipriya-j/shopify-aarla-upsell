import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SetupGuide() {
  return (
    <s-page heading="Setup guide">
      <s-section heading="1. Create promotions">
        <s-paragraph>
          Use the Promotions page to create unlimited database-backed campaigns.
          Enter the Shopify discount code on each promotion — this app never
          creates or validates discounts.
        </s-paragraph>
      </s-section>
      <s-section heading="2. Enable the theme embed">
        <s-paragraph>
          Online Store → Themes → Customize → App embeds → enable{" "}
          <s-text type="strong">Aarla Promotions</s-text>. Only global
          appearance settings live in the theme editor.
        </s-paragraph>
      </s-section>
      <s-section heading="3. App proxy">
        <s-paragraph>
          The storefront loads active promotions from{" "}
          <code>/apps/aarla-promotions/active</code> after page load. If the
          endpoint is unavailable, no popup is shown and the storefront
          continues normally.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
