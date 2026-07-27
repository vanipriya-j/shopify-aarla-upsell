import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActiveStorefrontPromotions } from "../models/promotions.server";

/**
 * App proxy endpoint: /apps/aarla-promotions/active
 * Returns only currently active storefront promotion payloads.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.public.appProxy(request);
    const shop =
      session?.shop || new URL(request.url).searchParams.get("shop") || "";

    if (!shop) {
      return Response.json({ promotions: [] }, { headers: cacheHeaders() });
    }

    const promotions = await getActiveStorefrontPromotions(shop);
    return Response.json({ promotions }, { headers: cacheHeaders() });
  } catch {
    // Fail silently for the storefront — never break cart/page rendering.
    return Response.json({ promotions: [] }, { headers: cacheHeaders() });
  }
};

function cacheHeaders(): HeadersInit {
  return {
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    "Content-Type": "application/json",
  };
}
