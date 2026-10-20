# QR + screenshot mode

`PAYMENT_MODE: 'qr'` in `assets/js/config.js` is the current default. This mode shows a UPI QR and asks the buyer to upload a receipt screenshot. Gemini extracts the screenshot fields; application checks also enforce the amount, receiver name, UTR uniqueness, time window and attempt caps.

## Critical limitation
**A screenshot is not bank-confirmed payment proof.** Gemini can misread evidence and a sufficiently convincing fake can sometimes pass. This implementation automatically marks a matching screenshot as paid; that is not safe enough for public sales on its own. Until it is changed to manual review or bank/provider verification, do not rely on automatic QR screenshot approval to deliver paid files to customers.

## Cloudflare setup (KV, no R2)
1. Deploy via Git integration or Wrangler (not static-only dashboard upload), with build command `npm run build` and output folder `dist`. Keep `functions/` at the repo root.
2. Run `npx wrangler d1 execute alfa-store-db --remote --file=schema.sql` on the empty D1 database.
3. Add Pages bindings: `DB` → `alfa-store-db`; `BUNDLE_KV` → `alfa-store-bundle`.
4. Add variables: `DOWNLOAD_SIGNING_SECRET` (secret), `GEMINI_API_KEY` (secret), `SITE_URL` (no trailing slash), `PAYEE_NAME` (must match the UPI receiver), optional `UPI_ID`.
5. Upload a ZIP containing the seven final PDFs to KV with key `bundles/online-business-blueprint-7-guides.zip`. Keep it below 24 MiB; Cloudflare KV's single-value limit is 25 MiB. Do not commit the ZIP/PDFs to the website repo.
6. Redeploy after bindings/secrets are configured and test using your own UPI transaction, reconciling the result against the bank/UPI app before delivery.

Upload command from a PC with Wrangler authenticated:

```powershell
npx wrangler kv key put --namespace-id=569b3b8a32ad4c44ac36738d287af260 "bundles/online-business-blueprint-7-guides.zip" --path="./online-business-blueprint-7-guides.zip" --remote
```

PhonePe variables are not needed when `PAYMENT_MODE` is `qr`. If/when using PhonePe mode, follow `docs/PHONEPE_SETUP.md`; server-side provider order status is a stronger payment verification method than screenshot analysis.
