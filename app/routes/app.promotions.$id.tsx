import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getPromotion, updatePromotion } from "../models/promotions.server";
import { withExpandedQualifyingProducts } from "../models/collection-expand.server";
import { parsePromotionForm } from "../promotions/form";
import { PromotionForm } from "../components/PromotionForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const promotion = await getPromotion(session.shop, String(params.id));
  if (!promotion) {
    throw redirect("/app");
  }
  return { promotion };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const input = parsePromotionForm(formData);
  input.targets = await withExpandedQualifyingProducts(
    admin,
    input.targets || [],
  );
  await updatePromotion(session.shop, String(params.id), input);
  return redirect(`/app/promotions/${params.id}`);
};

export default function EditPromotion() {
  const { promotion } = useLoaderData<typeof loader>();

  return (
    <s-page heading={`Edit ${promotion.name}`}>
      <s-button slot="primary-action" href="/app" variant="tertiary">
        Back
      </s-button>
      <s-section>
        <s-paragraph>
          Promotion ID: <code>{promotion.id}</code> (use in theme embed test
          mode)
        </s-paragraph>
        <PromotionForm
          submitLabel="Save promotion"
          values={{
            name: promotion.name,
            enabled: promotion.enabled,
            priority: promotion.priority,
            audienceType: promotion.audienceType,
            headline: promotion.headline,
            message: promotion.message,
            discountCode: promotion.discountCode,
            ctaText: promotion.ctaText,
            ctaUrl: promotion.ctaUrl,
            popupDelayMs: promotion.popupDelayMs,
            validityHours: promotion.validityHours,
            showOnce: promotion.showOnce,
            dismissalSuppressionHours: promotion.dismissalSuppressionHours,
            utmSource: promotion.utmSource || "",
            utmMedium: promotion.utmMedium || "",
            utmCampaign: promotion.utmCampaign || "",
            utmContent: promotion.utmContent || "",
            landingPath: promotion.landingPath || "",
            minimumCartValue: promotion.minimumCartValue,
            startsAt: promotion.startsAt,
            endsAt: promotion.endsAt,
            targets: promotion.targets.map((t) => ({
              targetType: t.targetType,
              shopifyResourceId: t.shopifyResourceId,
            })),
          }}
        />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
