// PhonePe PG v2 Standard Checkout endpoints, taken from the official docs
// (developer.phonepe.com -> Standard Checkout -> API Reference), checked 2026-10-20.
// Credentials are read from Cloudflare environment variables / secrets ONLY.
const URLS = {
  sandbox: {
    token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    pay: 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay',
    status: (merchantOrderId) =>
      `https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status`,
  },
  production: {
    token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    pay: 'https://api.phonepe.com/apis/pg/checkout/v2/pay',
    status: (merchantOrderId) =>
      `https://api.phonepe.com/apis/pg/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status`,
  },
};

// Names only. Values live in Cloudflare Pages -> Settings -> Environment variables.
export const REQUIRED_ENV = [
  'PHONEPE_ENV',                // "sandbox" | "production"
  'PHONEPE_CLIENT_ID',
  'PHONEPE_CLIENT_SECRET',      // secret
  'PHONEPE_CLIENT_VERSION',
  'PHONEPE_WEBHOOK_USERNAME',
  'PHONEPE_WEBHOOK_PASSWORD',   // secret
  'DOWNLOAD_SIGNING_SECRET',    // secret: HMAC key for short-lived download links
  'SITE_URL',                   // e.g. https://alfamedia.store (used for the PhonePe redirectUrl)
];

/** Returns { ok:true, config } or { ok:false, missing:[...] } — never throws, never logs values. */
export function loadPhonePeConfig(env = {}) {
  const missing = REQUIRED_ENV.filter((k) => !env[k] || String(env[k]).trim() === '');
  if (missing.length) return { ok: false, missing };
  const mode = String(env.PHONEPE_ENV).trim().toLowerCase();
  if (!URLS[mode]) return { ok: false, missing: ['PHONEPE_ENV (must be "sandbox" or "production")'] };
  return {
    ok: true,
    config: {
      mode,
      urls: URLS[mode],
      clientId: env.PHONEPE_CLIENT_ID,
      clientSecret: env.PHONEPE_CLIENT_SECRET,
      clientVersion: env.PHONEPE_CLIENT_VERSION,
      webhookUsername: env.PHONEPE_WEBHOOK_USERNAME,
      webhookPassword: env.PHONEPE_WEBHOOK_PASSWORD,
      signingSecret: env.DOWNLOAD_SIGNING_SECRET,
      siteUrl: String(env.SITE_URL).replace(/\/+$/, ''),
    },
  };
}
