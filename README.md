# Alfa Media Digital Store 🚀

A premium, mobile-first, responsive digital product storefront built for **Alfa Media Digital Store** selling the **"Online Business Blueprint Bundle – 7 PDF Guides"** for **₹399**.

Designed as a branded, modern, and trustworthy store using standard web technologies (HTML5, modern CSS3 with custom properties, vanilla ES modules JavaScript, and inline/SVG vector assets). It requires **no build step or frameworks** for deployment, but also includes Vite configuration for standard automated CI/CD builds.

---

> ### ⚠️ Legal & Compliance Notice
> **IMPORTANT:** The policy documents included in this repository (`privacy.html`, `terms.html`, and `refund.html`) are operational templates drafted for digital goods in India. They contain placeholders (`{{BUSINESS_NAME}}`, `{{SUPPORT_EMAIL}}`, `{{LAST_UPDATED}}`) and **must be reviewed and customized by a qualified legal professional** to ensure full compliance with your local jurisdiction, tax regulations (GST), and payment processor rules before processing commercial transactions.

---

## 🌟 Key Features

1. **Design & Brand Aesthetics**:
   - Floating white rounded-pill navigation bar over hero with mobile hamburger drawer.
   - Deep forest green palette (`#0F3D1E`, `#1F5E2E`, `#C8F169` lime accent, `#F5F6F3` off-white).
   - Editorial typography combining Inter / Plus Jakarta Sans with Playfair Display italic accents.
   - Horizontal scroll-snap carousel of all 7 PDF guides with category tags, page counts, and chapter modals.
   - 6-tile interactive preview gallery with full-screen lightbox modal.
   - Step-by-step "How It Works" sequence (4 steps) and comprehensive FAQ accordion.
   - Mobile-first sticky bottom checkout bar.

2. **Honest Product Copy**:
   - Strict adherence to transparency: zero fabricated income guarantees, realistic frameworks, clear operational playbooks.
   - Verifiable curriculum details for all 7 guides totaling over 250 pages.

3. **Checkout & Download Architecture**:
   - Secret keys and permanent download URLs are kept out of frontend code.
   - The success page requests status from `/api/order-status`; it does not unlock a file from a URL parameter alone.
   - PhonePe mode checks payment status server-side. The default QR mode analyzes screenshots with Gemini, but **a screenshot and AI analysis are not bank-confirmed payment proof**. Do not rely on that auto-approval for live sales without manually reconciling payments or switching to a verified payment gateway.
   - Download links are HMAC-signed, short-lived, bound to a paid order, and limited in use.

---

## 📁 Project Structure

```text
├── index.html                   # Main storefront single-page layout
├── success.html                 # Server-verified order status & download page
├── cancel.html                  # Friendly payment cancelled / retry page
├── privacy.html                 # Privacy policy template
├── terms.html                   # Terms of service template
├── refund.html                  # Digital goods refund & replacement policy
├── 404.html                     # Custom 404 error page
├── _headers                     # Cloudflare Pages security headers & caching
├── assets/
│   ├── css/
│   │   └── styles.css           # Pure CSS styling, responsive layout, animations
│   ├── js/
│   │   ├── config.js            # Single configuration file for pricing, copy & endpoints
│   │   ├── checkout.js          # Secure checkout invocation logic
│   │   ├── main.js              # Storefront UI interactions (carousel, FAQ, lightbox)
│   │   └── success.js           # Order verification polling & status rendering
│   └── img/
│       ├── favicon.svg          # Vector favicon
│       ├── placeholder-hero.svg # Branded hero banner illustration
│       ├── placeholder-about.svg# About section illustration
│       ├── placeholder-guide-*.svg # Cover art for all 7 PDF guides
│       └── placeholder-preview-*.svg # High-res sample page previews
└── docs/
    └── BACKEND_CONTRACT.md      # API specifications for checkout & verification
```

---

## ⚙️ Configuration (`assets/js/config.js`)

All store settings, guide titles, prices, and endpoints are centralized in `assets/js/config.js`:

```javascript
export const STORE_CONFIG = {
  STORE_NAME: 'Alfa Media Digital Store',
  PRODUCT_NAME: 'Online Business Blueprint Bundle – 7 PDF Guides',
  PRICE_INR: 399,
  ORIGINAL_VALUE_INR: 1999,
  CURRENCY: '₹',
  
  // Connect your backend here (see docs/BACKEND_CONTRACT.md)
  CHECKOUT_ENDPOINT: 'https://api.yourdomain.com/create-checkout',
  ORDER_STATUS_ENDPOINT: 'https://api.yourdomain.com/order-status',
  
  SUPPORT_EMAIL: 'alfamediaautomations@gmail.com',
  WHATSAPP_NUMBER: '+919876543210',
  ...
};
```

---

## 🚀 Deploy the full website to Cloudflare Pages

This repository contains **Pages Functions** in the root `functions/` directory. A static-only dashboard upload does not deploy those API routes. Use **Git integration** or Wrangler for the complete checkout + download backend.

1. Put the project files in a **private GitHub repository**. Do not add `.dev.vars`, actual API keys, the 7 PDFs, or the ZIP bundle. `.gitignore` helps keep these out.
2. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git**, and select that repository.
3. Set Framework preset to `None`, build command to `npm run build`, and build output directory to `dist`. Keep `functions/` at the repository root; Pages deploys those Functions automatically with the build.
4. Deploy once to get the `https://<project>.pages.dev` address. Set `SITE_URL` to that exact base address with no trailing slash.
5. Create/configure the D1 schema, add the `DB` binding, and add the `BUNDLE_KV` binding as described below. Redeploy after adding bindings because bindings become active on the next deployment.

Alternatively, from a PC with Node.js and Wrangler authenticated, run `npm install`, `npm test`, `npm run build`, then `npx wrangler pages deploy dist --project-name alfa-media-digital-store` from the project root. Keep `functions/` at the root so Wrangler can package the API routes.

## 🗂️ Product ZIP storage without R2

The download API supports either a private R2 bucket (`BUNDLE_BUCKET`) or a Workers KV namespace (`BUNDLE_KV`). The KV option avoids R2, but an individual KV value must be **25 MiB or smaller**. Keep the ZIP below 24 MiB to leave a margin. KV has free-tier operation limits; it is not unlimited.

For this account, the existing KV namespace is `alfa-store-bundle` (ID `569b3b8a32ad4c44ac36738d287af260`). Create a ZIP containing only the seven final PDFs and name it `online-business-blueprint-7-guides.zip`. Do not include the ZIP/PDFs in GitHub. From a PC with Wrangler logged in, run:

```powershell
npx wrangler kv key put --namespace-id=569b3b8a32ad4c44ac36738d287af260 "bundles/online-business-blueprint-7-guides.zip" --path="./online-business-blueprint-7-guides.zip" --remote
```

Then, in **Workers & Pages → your Pages project → Settings → Bindings**, add:
- D1 database binding: variable name `DB`, database `alfa-store-db`.
- KV namespace binding: variable name `BUNDLE_KV`, namespace `alfa-store-bundle`.

KV reads are eventually consistent, so after uploading/replacing the ZIP, allow up to about 60 seconds before testing a download from a different region.

## 🔐 Variables / secrets for the current QR mode

Current `assets/js/config.js` uses `PAYMENT_MODE: 'qr'`. In Pages → Settings → Variables and Secrets, set:
- `DOWNLOAD_SIGNING_SECRET` — **secret**, long random string (32 random bytes or more).
- `GEMINI_API_KEY` — **secret**, from Google AI Studio; Gemini quotas may apply.
- `SITE_URL` — plain variable, your `https://<project>.pages.dev` address, no trailing slash.
- `PAYEE_NAME` — plain variable, exact payee name shown in the receiving UPI app (currently the front-end is set to `Manoj`; change it if the bank/UPI app shows a different name).
- `UPI_ID` — optional plain variable, recommended if the receipt displays it.

Replace dummy support/WhatsApp/social links in `assets/js/config.js` and policy-page placeholders before live use. Store secrets only in Cloudflare, never in GitHub or frontend JavaScript.

## ⚠️ Important payment safety note

The current QR mode asks buyers to upload a payment screenshot and uses Gemini to read it. **That is not a bank/UPI transaction verification.** Fake screenshots can sometimes pass even if these tests pass. Do not enable automatic delivery for real customers based only on AI screenshot analysis. Before taking public payments, either verify each UTR/payment against your real UPI/bank account yourself, withhold delivery until you manually confirm it, or complete a real payment-provider integration whose server-side status API confirms the ₹399 payment.

## 🔗 Connecting Your Payment Gateway

Follow the API contract in [`docs/BACKEND_CONTRACT.md`](./docs/BACKEND_CONTRACT.md):
1. **Checkout Flow**: The "Buy Now – ₹399" button sends `POST { productId, amount: 399, currency: 'INR', returnUrl, cancelUrl }` to your backend `CHECKOUT_ENDPOINT`. Your backend calls Razorpay, Cashfree, Stripe, or PhonePe and returns `{ checkoutUrl }`.
2. **Payment Webhook**: The gateway notifies your backend when payment is successful.
3. **Download Delivery**: The customer is redirected to `success.html?order_id=...`. `success.js` calls your `ORDER_STATUS_ENDPOINT` to verify the payment. Upon confirmation, the backend returns a pre-signed, time-limited download URL.

---

## 📄 License & Ownership
Copyright © 2026 Alfa Media Digital Store. All rights reserved.

---

## 💳 PhonePe Payments + Secure Delivery

**Full setup, env vars, deployment and sandbox checklist: [`docs/PHONEPE_SETUP.md`](./docs/PHONEPE_SETUP.md).** Not verified against PhonePe's real sandbox yet.

Built in small, tested steps. Live frontend stays unchanged; only the contract endpoints get connected.

| Step | Scope | Status |
|---|---|---|
| 1 | Build/page-routing fix, DEMO removed, backend skeleton, DB schema, tests | ✅ done |
| 2 | PhonePe auth + Create Payment + server-side Order Status | ✅ code done, unit-tested with stubbed PhonePe |
| 3 | Webhook (SHA auth), duplicate handling, private ZIP via R2 or KV, signed download, optional email | ✅ code done, unit-tested |
| 4 | Success/failed/pending/retry UI states | ✅ wired; ⏳ not yet seen against real sandbox |
| 5 | Real sandbox test, onboarding placeholders, go-live | ⏳ **you** — see `docs/PHONEPE_SETUP.md` |

### Build & test
```bash
npm run build   # -> dist/ static pages + assets
npm test        # 32 automated tests (provider calls are stubbed)
```

### Cloudflare Pages settings
Framework preset **None** · Build command `npm run build` · Output directory `dist`.
The `functions/` directory must stay at repository root and is deployed through Git integration / Wrangler. Static-only dashboard upload will not deploy the API routes.

### Bindings and environment variables
For the current QR mode, bind `DB` to D1 and `BUNDLE_KV` to the `alfa-store-bundle` KV namespace. For PhonePe mode, use the same D1 binding and either `BUNDLE_KV` or a private R2 bucket (`BUNDLE_BUCKET`). Configure `DOWNLOAD_SIGNING_SECRET` and `SITE_URL` in Cloudflare; QR mode additionally needs `GEMINI_API_KEY`, `PAYEE_NAME`, and optionally `UPI_ID`. PhonePe mode needs the `PHONEPE_*` variables listed in `docs/PHONEPE_SETUP.md`. Keep secret values out of GitHub and browser JavaScript.

### Database
On the existing empty D1 database, run `npx wrangler d1 execute alfa-store-db --remote --file=schema.sql`. This creates the tables used by orders, webhook deduplication, tokens, and QR proof submissions.

### Bundle ZIP
Compress exactly the 7 finished PDFs into `online-business-blueprint-7-guides.zip`. For KV, keep the ZIP under 24 MiB (the single-value hard limit is 25 MiB) and upload it to key `bundles/online-business-blueprint-7-guides.zip` with the Wrangler command in the section above. Do not commit PDF/ZIP product files to GitHub or `dist/`.

### Security rules this project follows
Price is fixed server-side (₹399 = 39900 paise). In PhonePe mode, the server confirms payment with PhonePe Order Status; success URLs and webhook bodies alone never unlock anything. In the current QR mode, screenshot analysis by Gemini is not bank-confirmed proof and may be fooled, so do not rely on automatic approval for live sales. Unpaid database orders cannot get a download link. Secrets live only in Cloudflare variables.
