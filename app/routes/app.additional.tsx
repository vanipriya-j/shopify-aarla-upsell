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
      <s-section heading="Theme editor">
        <s-paragraph>
          Configure Aarla Promotions under Online Store → Themes → Customize →
          App embeds. Use Test mode to preview an enabled promotion without
          writing to live visitor localStorage.
        </s-paragraph>
      </s-section>
      <s-section heading="Discount codes">
        <s-paragraph>
          Create discount codes in Shopify Admin → Discounts. Enter the same
          code in the matching app embed setting. Leave the code blank to hide
          code display and Copy Code controls.
        </s-paragraph>
      </s-section>
      <s-section heading="Apply and Shop URL">
        <s-paragraph>
          When a code is configured, the CTA uses Shopify&apos;s discount URL
          pattern: /discount/CODE?redirect=/desired-path
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
