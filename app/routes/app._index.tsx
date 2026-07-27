import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Aarla Promotions">
      <s-section heading="Storefront promotional popup">
        <s-paragraph>
          Aarla Promotions shows one configurable promotional popup on your
          storefront through a Theme App Extension. Shopify remains responsible
          for creating, validating, and applying discount codes.
        </s-paragraph>
        <s-paragraph>
          V1 settings live entirely in the theme editor. There is no promotions
          database, analytics dashboard, or custom discount engine.
        </s-paragraph>
      </s-section>

      <s-section heading="Enable the app embeds">
        <s-ordered-list>
          <s-list-item>
            Open Online Store → Themes → Customize → App embeds.
          </s-list-item>
          <s-list-item>
            Enable <s-text type="strong">Aarla Promotions</s-text> (global
            settings + welcome offer).
          </s-list-item>
          <s-list-item>
            Optionally enable <s-text type="strong">Aarla Campaign A</s-text>{" "}
            and/or <s-text type="strong">Aarla Campaign B</s-text>.
          </s-list-item>
          <s-list-item>
            Configure copy, discount codes, UTM matching, and popup appearance.
          </s-list-item>
          <s-list-item>Save the theme.</s-list-item>
        </s-ordered-list>
        <s-paragraph>
          Shopify limits each app embed to 25 settings, so the three promotion
          slots are split across embeds that share one storefront engine.
        </s-paragraph>
      </s-section>

      <s-section heading="Create discounts in Shopify Admin">
        <s-paragraph>
          This app never creates discounts. Create codes such as{" "}
          <s-text type="strong">AARLA10</s-text> under Discounts in Shopify
          Admin, then paste the same code into the app embed settings.
        </s-paragraph>
        <s-paragraph>
          Recommended AARLA10 setup: Amount off order, Discount code, 10% off,
          one use per customer, disable combinations if only one code should
          apply. Shopify validates eligibility at checkout.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Promotion priority">
        <s-unordered-list>
          <s-list-item>Matching UTM campaign</s-list-item>
          <s-list-item>Matching landing-page campaign</s-list-item>
          <s-list-item>First-time browser welcome</s-list-item>
          <s-list-item>No promotion</s-list-item>
        </s-unordered-list>
        <s-paragraph>
          Only one promotion is active at a time. First-time visitor targeting
          is browser localStorage based and does not prove a customer has never
          purchased.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Docs">
        <s-paragraph>
          See the repository README for CLI setup, deployment, discount setup,
          and the manual storefront test checklist.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
