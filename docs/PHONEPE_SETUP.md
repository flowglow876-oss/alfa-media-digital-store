# PhonePe checkout + secure delivery — setup & sandbox testing

> **Status: code complete and unit-tested with a stubbed PhonePe. NOT yet tested against PhonePe's real sandbox,
> and no real transaction or real PDF delivery has been tested.** Do not call payments "working" until you finish
> section 5 below and see it with your own eyes. Do not switch `PHONEPE_ENV` to `production` until PhonePe has
> approved your merchant account and signed off UAT.

## 1. How it works
1. **Buy Now** → `POST /api/create-checkout`. The server creates order `ALFA-<32 hex>` for **₹399 (39900 paise, fixed in
   `functions/_lib/constants.js`; any client amount is ignored)** and calls PhonePe *Create Payment* (`PG_CHECKOUT`).
2. Browser is redirected to PhonePe's hosted checkout. PhonePe returns the customer to `SITE_URL/success.html?order_id=…`
   whatever the outcome (success, failure, or the customer backing out).
3. `success.html` calls `GET /api/order-status`. The **server** calls PhonePe *Order Status*; only `state=COMPLETED` with
   amount exactly 39900 paise (and matching PhonePe order id) becomes `paid`. URL parameters, screenshots, UTRs never count.
4. PhonePe also posts a webhook to `/api/phonepe-webhook`. It is authenticated (SHA256 of `username:password`), but its
   body is **not trusted** — it only triggers the same Order Status check. Duplicates/replays are harmless.
5. When paid, the server mints a **10-minute HMAC-signed link** (`/api/download?token=…`, max 5 uses, max 20 links/order)
   that streams the ZIP from private R2 or a KV value. No permanent file URL exists anywhere.
6. Optional: customer enters an email on the success page → `/api/send-link` emails the *order-page* link (not a file URL).

Statuses: `pending` (shown as "Payment verification pending" + *Check payment status* button), `failed` (*Try Again* —
the server reuses an open order or checks the old one one last time before creating a new one, so no duplicate charges),
`paid`, and `review` (PhonePe said COMPLETED but amount/ids mismatched → never delivered; shown to customer as pending
with a "contact support" message).

## 2. Environment variables (names only)
| Name | Secret? | Notes |
|---|---|---|
| `PHONEPE_ENV` | no | `sandbox` (default for testing) or `production` |
| `PHONEPE_CLIENT_ID` | no | from PhonePe Business Dashboard → Developer Settings |
| `PHONEPE_CLIENT_SECRET` | **yes** | |
| `PHONEPE_CLIENT_VERSION` | no | given with your credentials |
| `PHONEPE_WEBHOOK_USERNAME` / `PHONEPE_WEBHOOK_PASSWORD` | password **yes** | you invent these; enter the same pair in the PhonePe dashboard |
| `DOWNLOAD_SIGNING_SECRET` | **yes** | `openssl rand -hex 32` |
| `SITE_URL` | no | e.g. `https://your-project.pages.dev` (no trailing slash) |
| `RESEND_API_KEY`, `EMAIL_FROM` | key **yes** | optional; email is skipped if unset |

Bindings (Pages → Settings → Bindings): **`DB`** (D1) and either **`BUNDLE_BUCKET`** (private R2) or **`BUNDLE_KV`** (KV namespace).
Set sandbox values for **Preview** and production values only for **Production**.

## 3. Deploy (Cloudflare Pages, free tier where practical)
1. Push this repo to a **private** GitHub repo (no PDFs, no `.dev.vars` — `.gitignore` already blocks them).
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git. Framework **None**, build `npm run build`, output `dist`.
3. The `alfa-store-db` D1 database already exists for this project. Apply its initial schema with `npx wrangler d1 execute alfa-store-db --remote --file=schema.sql`. If you start from a new account, create D1 first.
4. Upload the ZIP at key `bundles/online-business-blueprint-7-guides.zip` using either private R2 or KV. For KV, keep the ZIP at or below 25 MiB and use the Wrangler command in `README.md`.
5. Add the `DB` binding and either `BUNDLE_KV` or `BUNDLE_BUCKET`, plus the variables above. Redeploy.
6. In the Cloudflare dashboard add a **rate-limiting rule** for `/api/create-checkout`, `/api/order-status`,
   `/api/send-link` (free plans include a basic rule) to deter bots.
7. **Webhook** (in PhonePe dashboard, when you have access): URL `https://<SITE_URL host>/api/phonepe-webhook`,
   authentication = username/password (SHA), same values as your env vars.

**Free-tier limits — check the current numbers because they can change:** Cloudflare Pages/Functions, D1 and KV allowances: <https://developers.cloudflare.com/pages/functions/pricing/>, <https://developers.cloudflare.com/d1/platform/pricing/>, <https://developers.cloudflare.com/kv/platform/limits/>. A single KV value is limited to 25 MiB. Resend's free plan has sending caps and needs a verified domain:
<https://resend.com/pricing>. **PhonePe charges transaction fees (MDR/GST) per your merchant agreement** — nothing here
is fee-free, and free tiers are not unlimited.

## 4. Local run
`cp .dev.vars.example .dev.vars` (fill sandbox placeholders) → `npm run build` →
For KV locally, use `npx wrangler pages dev dist --d1 DB=<DATABASE_ID> --kv BUNDLE_KV` and apply `schema.sql` to the local DB. For R2 locally, pass `--r2 BUNDLE_BUCKET`. A localhost webhook is unreachable by PhonePe, so
locally rely on the Order Status check (it covers webhooks being missed) or use a tunnel.

## 5. Sandbox test checklist (do all; tick only what you actually saw)
Prereqs: PhonePe sandbox credentials, PhonePe **Test App** installed (PhonePe docs say to install it and configure a
template before paying in UAT), deployed Preview with `PHONEPE_ENV=sandbox`.
- [ ] **Success:** Buy Now → PhonePe checkout → simulate *success* → land on success page → "Payment Successful – Download Your Bundle" → ZIP downloads and all 7 PDFs open.
- [ ] **Webhook arrived:** D1 `webhook_events` has a row; order is `paid` even if you close the tab before redirect.
- [ ] **Failure:** simulate *failure* → "Payment Verification Failed" → **Try Again** → new PhonePe checkout; only one extra order row.
- [ ] **Pending:** simulate *pending* → "Payment verification pending" → **Check payment status** works; later resolves.
- [ ] **Back/cancel:** back out of PhonePe → success page shows pending/failed, never a download.
- [ ] **Double click Buy Now:** only one pending order created.
- [ ] **URL tamper:** open `/success.html?order_id=<an unpaid id>` and a random id → no download link.
- [ ] **Expiry:** wait >10 min, reuse an old download URL → 403; reopening the order page gives a fresh link.
- [ ] **Email (if enabled):** "Email me the link" delivers; the email contains the order-page link only.
- [ ] **Secrets:** view-source / Network tab show no client secret, token, or R2 URL.
Run `npm test` (unit tests with stubbed PhonePe) before every deploy.

## 6. PhonePe onboarding readiness — what the site still lacks
Found in this repo (I did **not** fill these in — they must be your real details):
- `privacy.html`, `terms.html`, `refund.html` contain **23 `{{BUSINESS_NAME}} / {{SUPPORT_EMAIL}} / {{LAST_UPDATED}}` placeholders**
  and an on-page "Notice to Store Owner" banner. Replace placeholders with your real details and remove the banner after review.
- `assets/js/config.js` (`SUPPORT_EMAIL`, `WHATSAPP_*`, `SOCIAL`) and `cancel.html` hold **sample contact details**
  (`alfamediaautomations@gmail.com`, `+91 98765 43210`, social handles) — replace with real, working ones.
- The Terms/Refund text should match your real refund practice; have it legally reviewed.
- Product description, ₹399 price, and delivery information are already on the site.

Documents: PhonePe's own onboarding article says the list depends on your business type and typically includes
entity KYC, a website showing Terms & Conditions and a Privacy Policy, and details that match across documents. The
authoritative, current list is whatever PhonePe's onboarding portal / "Merchant Onboarding Guidelines" shows for your
entity type — confirm there; I have not invented one. Do not publish a GSTIN/registration number you do not have.

## 7. Go-live (only after PhonePe approval + UAT sign-off)
Use separate production bindings/storage as appropriate, set production credentials, `PHONEPE_ENV=production`,
configure the production webhook in the dashboard, then do one real ₹399 test purchase and refund it.
Refunds are done from the PhonePe dashboard (webhook refund events are acknowledged but ignored by this code).
