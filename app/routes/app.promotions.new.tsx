import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { createPromotion } from "../models/promotions.server";
import { withExpandedQualifyingProducts } from "../models/collection-expand.server";
import { parsePromotionForm } from "../promotions/form";
import { PromotionForm } from "../components/PromotionForm";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const input = parsePromotionForm(formData);
  input.targets = await withExpandedQualifyingProducts(
    admin,
    input.targets || [],
  );
  const created = await createPromotion(session.shop, input);
  return redirect(`/app/promotions/${created.id}`);
};

export default function NewPromotion() {
  return (
    <s-page heading="Create promotion">
      <s-button slot="primary-action" href="/app" variant="tertiary">
        Back
      </s-button>
      <s-section>
        <PromotionForm submitLabel="Create promotion" />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
