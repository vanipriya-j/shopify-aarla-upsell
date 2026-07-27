# Aarla Promotions

Minimal custom Shopify app that displays **one configurable promotional popup** on the Aarla storefront via a Theme App Extension (App Embed).

Promotions are stored in the **app database** and managed in the embedded admin. The theme embed is only the storefront rendering layer. Shopify remains responsible for creating, validating, and applying discount codes.

## Architecture

```text
/
├── app/                                  # Embedded admin (React Router + TypeScript)
│   ├── models/promotions.server.ts       # CRUD + active storefront payload
│   ├── routes/app._index.tsx             # Promotion list
│   ├── routes/app.promotions.*.tsx       # Create / edit
│   └── routes/apps.aarla-promotions.active.tsx  # App proxy API
├── extensions/aarla-promotions/          # Theme App Extension
│   ├── blocks/aarla-promotions-embed.liquid
│   ├── assets/
│   └── src/                              # Storefront engine (vanilla JS)
└── prisma/                               # Session + Promotion + PromotionTarget
```

### Theme App Embed (global only)

One embed: **Aarla Promotions**

Settings:

- Master enable/disable
- Test mode + optional promotion ID preview
- Popup position / width / overlay / radius
- Reminder badge
- Debug logging
- API endpoint path (default `/apps/aarla-promotions/active`)

Promotion copy, audience rules, and discount codes are **not** in the theme editor.

### Matching order

1. UTM campaign
2. Landing page
3. Product / collection context (`PRODUCT_VIEW`, `PRODUCT_IN_CART`, `COLLECTION_IN_CART`)
4. Returning visitor
5. First visit
6. None

Within a category, highest priority wins. Only one promotion is active per visitor.

## Local development

### Prerequisites

- Node.js `>= 20.19 < 22` or `>= 22.12`
- npm
- Shopify CLI (`npm install -g @shopify/cli@latest`)

### Install

```bash
npm install
npm run setup
npm run seed          # optional: SEED_SHOP=your-store.myshopify.com npm run seed
npm run build:extension
```

Default seed creates (disabled):

1. First Visit Welcome (`AARLA10`)
2. Campaign A (UTM `meta` / `water_bottles`)
3. Campaign B

Opening the admin app also seeds these defaults per shop if none exist.

### Authenticate & link

```bash
shopify auth login
npm run config:link
npm run dev
```

### Enable storefront

1. Online Store → Themes → Customize → App embeds
2. Enable **Aarla Promotions**
3. Save

### Create discounts in Shopify Admin

This app does **not** create discounts. For AARLA10:

| Setting      | Recommendation                        |
| ------------ | ------------------------------------- |
| Type         | Amount off order                      |
| Method       | Discount code                         |
| Code         | `AARLA10`                             |
| Value        | 10%                                   |
| Usage limit  | One use per customer                  |
| Combinations | Disable if only one code should apply |

## Deploy

```bash
npm run build
npm run deploy
```

Ensure the app proxy is configured (`/apps/aarla-promotions` → app `/apps/aarla-promotions`) and scopes include `read_products`.

## Quality checks

```bash
npm run build
npm run build:extension
npm run format
npm run lint
npm run typecheck
npm run migrate
npm test
```

## Manual storefront checklist

- Desktop / mobile popup + badge
- Keyboard: focus trap, Escape, restore focus
- Campaign URL with UTM persistence across navigation
- First visit vs return visit
- Product view / cart qualification
- Expiry clears state
- Discount URL `/discount/CODE?redirect=...`
- Empty discount code hides code controls
- API unavailable → no popup, storefront intact
- App embed enabled / disabled

## Separation of responsibilities

| This app stores                 | Shopify stores             |
| ------------------------------- | -------------------------- |
| Who should see the promo        | Discount value             |
| When it appears                 | Eligibility / usage limits |
| Presentation copy               | Combination rules          |
| Referenced discount code        | Buy X Get Y enforcement    |
| Qualifying products/collections | Checkout validation        |
