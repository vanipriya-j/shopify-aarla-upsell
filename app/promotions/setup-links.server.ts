import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EMBED_HANDLE = "aarla-promotions-embed";

/**
 * Build theme-editor deep link to activate the Aarla Promotions app embed.
 */
export function buildEmbedDeepLink(shop: string, apiKey: string) {
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(
    apiKey,
  )}/${EMBED_HANDLE}`;
}

/**
 * While `shopify app dev` is running, the CLI keeps the host/preview theme id
 * in a local config file. Prefer that theme for storefront QA links.
 */
export function readCliPreviewThemeId(shop: string): string | null {
  const handle = shop.replace(/\.myshopify\.com$/i, "");
  const candidates = [
    path.join(
      os.homedir(),
      ".config/shopify-cli-host-theme-conf-nodejs/config.json",
    ),
    path.join(
      os.homedir(),
      ".config/shopify-cli-kit-nodejs/host-theme-conf.json",
    ),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
        string,
        unknown
      >;
      const shopNode = raw[handle] as
        | { myshopify?: { com?: string | number } }
        | undefined;
      const themeId = shopNode?.myshopify?.com;
      if (themeId != null && String(themeId).trim()) {
        return String(themeId).trim();
      }
    } catch {
      // Ignore unreadable/malformed CLI config.
    }
  }

  return process.env.SHOPIFY_CLI_THEME_ID?.trim() || null;
}

/**
 * Storefront URL that clears the visitor marker and (when available) targets
 * the CLI preview theme where the embed is actually installed during dev.
 */
export function buildForceFirstVisitUrl(shop: string, themeId?: string | null) {
  const params = new URLSearchParams();
  params.set("aarla_force_first_visit", "1");
  if (themeId) params.set("preview_theme_id", themeId);
  return `https://${shop}/?${params.toString()}`;
}
