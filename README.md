# Aarla Promotions

Minimal custom Shopify app that displays **one configurable promotional popup** on the Aarla storefront via a Theme App Extension (App Embed). It does **not** edit `theme.liquid`, create discounts, calculate prices, or store promotions in a database.

Shopify remains responsible for creating, validating, and applying discount codes.

## What this app does

- Loads a promotional popup through an App Embed Block
- Configures promotions in the Shopify Theme Editor
- Evaluates eligibility in this order:
  1. Matching UTM campaign promotion
  2. Matching landing-page promotion
  3. First-time browser welcome promotion
  4. No promotion
- Persists the single active promotion in `localStorage` under `aarla_promotions`
- Supports Copy Code and Apply and Shop (`/discount/CODE?redirect=...`)
- Optional reminder badge after the popup closes
- Test mode for merchant preview without writing live visitor state

## What this app does not do

- Full promotion platform / analytics dashboard
- Promotions database for V1
- Shopify Functions / order attribution
- Custom discount calculation
- Theme file edits
- Collecting email, phone, or WhatsApp
- Claiming that “first-time visitor” proves a customer has never purchased

## Architecture

```text
/
├── app/                          # Embedded Shopify admin (React Router + TypeScript)
├── extensions/aarla-promotions/  # Theme App Extension
│   ├── assets/
│   │   ├── aarla-promotions.css
│   │   └── aarla-promotions.js   # Bundled from src/
│   ├── blocks/
│   │   ├── aarla-promotions-embed.liquid      # Global + welcome
│   │   ├── aarla-promotions-campaign-a.liquid
│   │   └── aarla-promotions-campaign-b.liquid
│   ├── locales/
│   ├── src/                      # Modular storefront engine (vanilla JS)
│   └── tests/
├── prisma/                       # Session storage for the embedded app only
└── shopify.app.toml
```

Storefront behaviour is vanilla JavaScript + CSS + Liquid. React is used only for the embedded admin app.

### Why three app embeds?

Shopify limits each theme app block/embed to **25 interactive settings**. The requested global settings plus three full promotion slots exceed that limit, so V1 uses:

| App embed            | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| **Aarla Promotions** | Master switch, appearance, test mode, welcome slot, loads JS/CSS |
| **Aarla Campaign A** | Campaign Promotion A settings                                    |
| **Aarla Campaign B** | Campaign Promotion B settings                                    |

Enable the main embed always. Enable campaign embeds as needed. They share one engine and still enforce a single active promotion.

## First-time visitor definition

For V1, a first-time visitor means the current browser has **no** existing `aarla_promotions` marker in `localStorage`. This is browser-based targeting only. Shopify discount eligibility settings remain the final authority on whether a customer can use a code.

Stored fields under `aarla_promotions`:

- visitor ID
- first visit timestamp
- last visit timestamp
- active promotion key
- active discount code
- promotion activation timestamp
- promotion expiry timestamp
- popup viewed state
- popup dismissed state
- badge dismissed state

## Local development

### 1. Prerequisites

- Node.js `>= 20.19 < 22` or `>= 22.12`
- npm
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) (`npm install -g @shopify/cli@latest`)
- A Shopify Partner account and development store (or the Aarla store)

### 2. Install dependencies

```bash
npm install
npm run build:extension
```

### 3. Authenticate with Shopify

```bash
shopify auth login
```

### 4. Connect the app to the Aarla store

```bash
npm run config:link
# or: shopify app config link
```

Select / create the **Aarla Promotions** app and link it to the Aarla Shopify store (`*.myshopify.com`).

Update `shopify.app.toml` client ID / URLs as prompted by the CLI.

### 5. Run the app in development

```bash
npm run dev
```

Follow the CLI prompts to install the app on the store and open the preview URL.

### 6. Preview the Theme App Extension

While `npm run dev` is running:

1. Open the storefront preview / theme editor link from the CLI
2. Go to **Online Store → Themes → Customize → App embeds**
3. Enable **Aarla Promotions**
4. Optionally enable **Aarla Campaign A** / **Aarla Campaign B**
5. Turn on **Test mode** to preview without affecting live visitor state
6. Save

## Deploying and installing

### 7. Deploy the app

```bash
npm run build:extension
npm run deploy
# or: shopify app deploy
```

### 8. Install the app

Install from the Partner Dashboard / Dev Dashboard install link onto the Aarla store if it is not already installed.

### 9. Enable app embeds

1. Shopify Admin → **Online Store → Themes → Customize**
2. Open **App embeds**
3. Enable **Aarla Promotions**
4. Enable campaign embeds you intend to use
5. Configure copy, codes, UTM values, and appearance
6. Save the theme

### 10. Creating AARLA10 (and other codes) in Shopify Admin

This app **does not create discounts**. Create them in **Shopify Admin → Discounts**.

Recommended **AARLA10** setup:

| Setting              | Recommendation                                         |
| -------------------- | ------------------------------------------------------ |
| Discount type        | Amount off order                                       |
| Method               | Discount code                                          |
| Code                 | `AARLA10`                                              |
| Value                | 10%                                                    |
| Customer eligibility | As selected by the merchant                            |
| Usage limit          | Limit to one use per customer                          |
| Minimum purchase     | Optional                                               |
| Combinations         | Disable all combinations if only one code should apply |

Then enter `AARLA10` in the Welcome promotion discount code setting.

Shopify — not this app — validates discount eligibility at cart/checkout.

## App embed settings (defaults)

### Global

- Enable Aarla Promotions: on
- Test mode: off
- Test mode preview: Automatic
- Popup delay: 1200 ms
- Popup position: Center
- Popup maximum width: 420
- Overlay opacity: 45%
- Border radius: 12px
- Show reminder badge: on
- Debug logging: off

### Welcome Promotion

- Enabled: false
- Priority: 10
- Headline: Welcome to Aarla
- Message: Enjoy 10% off your first order.
- Discount code: AARLA10
- CTA text: Shop Aarla
- CTA destination: `/collections/all`
- Validity: 24 hours
- Show once: true
- Dismissal suppression: 24 hours

### Campaign Promotion A

- Enabled: false
- Priority: 100
- UTM source: meta
- UTM campaign: water_bottles
- Headline: A little something for you
- Message: Order within the next 24 hours and enjoy this campaign offer.
- Discount code: empty
- CTA text: Explore the collection
- CTA destination: `/collections/water-bottles`
- Validity: 24 hours

### Campaign Promotion B

- Enabled: false
- Priority: 90
- Headline: Complete your set
- Message: Buy an Aarla bottle and enjoy 50% off a bottle bag.
- Discount code: empty
- CTA text: Shop bottles
- CTA destination: `/collections/water-bottles`
- Validity: 24 hours

Empty UTM fields are ignored (not required matches). Matching is case-insensitive and trimmed.

## Quality checks

```bash
npm run build:extension
npm run format
npm run lint
npm run typecheck
npm test
```

## Automated tests

Vitest covers storefront promotion-selection logic:

- Campaign overrides first-time welcome
- Higher-priority campaign wins
- Disabled promotion does not match
- Expired promotion is cleared
- First-time welcome without campaign parameters
- Returning browser does not receive welcome
- Promotion remains active after UTM parameters disappear
- Only one active promotion is retained
- Empty discount code hides code-related controls
- Test mode does not alter production visitor state

## Manual storefront test checklist

Use a clean browser profile / cleared `localStorage` where noted.

### Desktop

- [ ] Popup appears after configured delay
- [ ] Overlay, headline, message, close button render correctly
- [ ] Layout does not shift the page; theme remains usable behind overlay

### Mobile

- [ ] Popup is readable and usable on a narrow viewport
- [ ] Reminder badge does not obstruct critical theme controls unnecessarily

### Keyboard navigation

- [ ] Focus moves into the dialog when opened
- [ ] Tab cycles within the dialog (focus trap)
- [ ] Escape closes the popup
- [ ] Focus returns to the previously focused element

### Popup dismissal

- [ ] Close / overlay dismiss stores dismissal state
- [ ] Dismissal suppression prevents immediate reopen
- [ ] Reminder badge still appears when enabled

### Reminder reopening

- [ ] Badge shows active code or “Your Aarla offer is active”
- [ ] Clicking badge reopens the same promotion only
- [ ] Badge dismiss hides it; no second promotion appears

### Campaign URL

- [ ] Visit `/?utm_source=meta&utm_campaign=water_bottles` with Campaign A enabled
- [ ] Campaign A wins over welcome
- [ ] Navigate to another page without UTM — campaign remains active until expiry

### First visit

- [ ] Clear `localStorage` key `aarla_promotions`
- [ ] With welcome enabled and no campaign match, welcome appears

### Return visit

- [ ] Reload after welcome was shown — welcome does not treat the browser as first-time again

### Expiry

- [ ] After validity hours (or temporarily shorten for testing), active state clears and badge hides
- [ ] Next page load re-evaluates promotions

### Discount URL

- [ ] With a code configured, Copy Code copies the code
- [ ] Apply and Shop navigates to `/discount/CODE?redirect=...`
- [ ] With empty code, code row and Copy Code are hidden; normal CTA remains

### App embed enabled / disabled

- [ ] With main embed disabled, no popup/badge appears
- [ ] With main embed enabled and promotions disabled, no popup appears
- [ ] Test mode shows “Test mode” label and does not change live `localStorage`

## Scripts

| Script                    | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `npm run build:extension` | Bundle storefront JS into the theme extension asset |
| `npm run dev`             | Shopify app + extension development                 |
| `npm run deploy`          | Deploy app/extension                                |
| `npm test`                | Run Vitest suite                                    |
| `npm run lint`            | ESLint                                              |
| `npm run typecheck`       | TypeScript check                                    |
| `npm run format`          | Prettier                                            |

## License

See `LICENSE.md`.
