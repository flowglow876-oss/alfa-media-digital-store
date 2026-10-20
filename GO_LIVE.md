# Go-live checklist (Cloudflare Pages + KV bundle storage)

## Deploy the app
1. Keep the project in a private GitHub repository (do not add PDFs, the product ZIP, `.dev.vars`, or secrets).
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git. Framework `None`, build `npm run build`, output `dist`. Keep `functions/` at the repository root; the Functions API routes must deploy with the static pages.
3. Run `npx wrangler d1 execute alfa-store-db --remote --file=schema.sql` against the empty database `alfa-store-db`.
4. Bind `DB` to `alfa-store-db` and `BUNDLE_KV` to `alfa-store-bundle` under Pages → Settings → Bindings, then redeploy.
5. Build a ZIP containing only the 7 final PDFs. Name it `online-business-blueprint-7-guides.zip` and keep it below 24 MiB (KV hard limit 25 MiB). Do not put it in the repository.
6. From a PC with Node.js/Wrangler authenticated, run:
   `npx wrangler kv key put --namespace-id=569b3b8a32ad4c44ac36738d287af260 "bundles/online-business-blueprint-7-guides.zip" --path="./online-business-blueprint-7-guides.zip" --remote`
7. Set Cloudflare Pages variables/secrets: `DOWNLOAD_SIGNING_SECRET` (secret), `GEMINI_API_KEY` (secret), `SITE_URL` (exact Pages URL, no trailing slash), `PAYEE_NAME` (exact receiver name), and optional `UPI_ID`.
8. Replace placeholder contact/social links and review the legal policy templates. Redeploy after any environment/binding configuration changes.

## Before accepting public payments
The current QR flow analyzes screenshots with Gemini and can auto-mark an order paid. **Gemini screenshot analysis is not direct verification with the bank/UPI provider, and a forged screenshot can pass.** Keep sales private/test-only until you manually confirm every payment against the actual UPI/bank account before delivery, or replace this with a verified payment-provider integration.

## Test
- `npm test` and `npm run build` pass locally.
- Visit the deployed site; verify all images and all policy pages load.
- Verify `/api/qr-order` returns a valid order only after all bindings/secrets are configured.
- Use an actual small controlled payment and compare the transaction in the recipient UPI/bank app before any delivery. Then download the ZIP and open all 7 PDFs.
- Do not assume unit tests prove that a real provider, account, or real PDF bundle works.
