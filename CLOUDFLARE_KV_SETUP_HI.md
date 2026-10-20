# Alfa Media Digital Store — Cloudflare KV setup (Hindi)

## Abhi ki status
- `alfa-store-bundle` KV namespace pehle se maujood hai.
- `alfa-store-db` D1 database maujood hai aur required tables apply/verify kar diye gaye hain.
- Cloudflare Pages project `alfa-media-digital-store` create ho chuka hai: `https://alfa-media-digital-store.pages.dev`.
- Pages project mein `DB`, `BUNDLE_KV`, `SITE_URL` aur `PAYEE_NAME=Manoj` configure hain. **Lekin website code ka production deployment abhi pending hai**, isliye URL ko abhi live storefront na samjhein.
- Is project ZIP mein 7 PDF guides aur unka download ZIP **shamil nahi** hai.
- `GEMINI_API_KEY` aur `DOWNLOAD_SIGNING_SECRET` ko Pages Variables and Secrets mein production aur preview environments ke liye set karna baaki hai. Secret ko public repo mein kabhi mat daalna.

## 1. Saat PDFs ka ZIP banao
1. Apni 7 final PDFs ko select karke ek ZIP banao.
2. ZIP ka naam exactly `online-business-blueprint-7-guides.zip` rakho.
3. ZIP ko khol kar check karo ke 7 PDFs saari theek open hoti hain.
4. Size 24 MiB se kam rakho. Workers KV ka ek value maximum 25 MiB ho sakta hai.
5. Is PDF/ZIP ko public GitHub repository ya website ke `public` folder mein mat daalna.

## 2. Website ko private GitHub repo mein daalo
1. Is project ZIP ko PC par extract karo.
2. GitHub par ek **private** repo banao, jaise `alfa-media-digital-store`.
3. Project ki files repo mein upload/push karo. `.dev.vars`, API keys, PDF files aur ZIP bundle commit mat karna.

## 3. Cloudflare Pages deploy karo
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Apni private GitHub repo connect karo.
3. Settings:
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Production branch: `main`
4. Deploy hone ke baad tumhe `https://<project-name>.pages.dev` URL milega.
5. Pages → Settings → Bindings mein:
   - D1 database binding ka variable name `DB`; database `alfa-store-db`
   - KV namespace binding ka variable name `BUNDLE_KV`; namespace `alfa-store-bundle`
6. Binding/secret set karne ke baad project redeploy karo. Is app mein `functions/` API routes hain, isliye sirf dashboard ka static drag-and-drop upload use mat karna.

## 4. ZIP ko existing KV namespace mein upload karo
PC par Node.js install karo. Command Prompt/PowerShell mein project ya ZIP wale folder mein jao, phir ye command chalao (Wrangler login maange to Cloudflare account se login karna):

```powershell
npx wrangler kv key put --namespace-id=569b3b8a32ad4c44ac36738d287af260 "bundles/online-business-blueprint-7-guides.zip" --path="./online-business-blueprint-7-guides.zip" --remote
```

Command ko us folder se chalana jahan ZIP file waqai saved ho; warna `--path` mein uska poora path daalna. Cloudflare KV upload ke baad global read availability mein lagbhag 60 seconds tak delay ho sakta hai.

## 5. Cloudflare variables / secrets
Pages → Settings → Variables and Secrets mein **Production** environment ke liye ye set karo:

- `SITE_URL` = apna exact `https://<project-name>.pages.dev` URL (end mein `/` nahi)
- `PAYEE_NAME` = UPI app mein receiver ka exact naam; abhi site `Manoj` dikhati hai, agar naam alag hai to frontend config aur variable dono update karo
- `UPI_ID` = optional, apna real receiving UPI ID
- `GEMINI_API_KEY` = Google AI Studio se API key; ise **Secret** mark karo
- `DOWNLOAD_SIGNING_SECRET` = **Secret**, 32 random bytes ya zyada. PC par Node.js se secret generate karne ke liye:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generated secret Cloudflare mein paste karo; ise GitHub, frontend config ya kisi chat mein paste mat karna.

## 6. Build test aur launch se pehle
Project folder mein run karo:

```powershell
npm test
npm run build
```

32 automated tests pass hue hain, lekin ye tests real payment gateway, real bank transaction, ya tumhari 7 actual PDFs ko verify nahi karte.

**Payment warning:** Current QR mode screenshot ko Gemini se read karke order auto-mark paid kar sakta hai. Ye bank/UPI account ka direct transaction verification nahi hai; convincing fake screenshot kabhi pass ho sakta hai. Public customers se paise lene se pehle har payment ko apne UPI/bank app mein manually confirm karke hi file do, ya verified payment-provider status API implement karo. Sirf AI screenshot check ke bharose automatic delivery live mat karna.

## 7. Contact details
`assets/js/config.js`, `cancel.html`, `privacy.html`, `terms.html` aur `refund.html` mein sample phone/social/contact details aur policy placeholders check karo. Apni real details aur legally reviewed policies ke bina store public mat launch karna.

## 7. (Naya) Double AI check — extra setting kuch zaroori nahi
- Payment verify ab **2 independent Gemini reads** se hota hai (dono ek saath chalte hain, isliye speed same rehti hai). Dono ko amount, UTR, time, receiver aur status par agree karna padta hai; kisi ek ne bhi "edited / AI-generated / photo of screen" bola to PDF lock rehti hai.
- Sirf `GEMINI_API_KEY` chahiye (pehle jaisa). Optional variables: `GEMINI_MODEL`, `GEMINI_MODEL_2` (default `gemini-flash-lite-latest`), `GEMINI_DOUBLE_CHECK=off` (agar free-tier ki rate limit kam pade to single read).
- Database ya storage mein koi change nahi: D1 + KV wahi hain, schema dobara apply karne ki zaroorat nahi.
