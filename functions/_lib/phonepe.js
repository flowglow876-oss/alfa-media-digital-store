// Thin PhonePe PG v2 Standard Checkout client (official endpoints, see phonepe-config.js).
// Secrets only ever come from `cfg` (Cloudflare env). Nothing here logs credentials or tokens.
const tokenCache = new Map(); // key: mode|clientId -> { token, expMs }

export class PhonePeError extends Error {
  constructor(message, { status = 0, transient = true } = {}) {
    super(message);
    this.name = 'PhonePeError';
    this.status = status;
    this.transient = transient;
  }
}

export function clearTokenCache() { tokenCache.clear(); }

export async function getAccessToken(cfg, fetchFn = fetch, { force = false } = {}) {
  const key = `${cfg.mode}|${cfg.clientId}`;
  const hit = tokenCache.get(key);
  if (!force && hit && hit.expMs - 60_000 > Date.now()) return hit.token;

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_version: cfg.clientVersion,
    client_secret: cfg.clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetchFn(cfg.urls.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new PhonePeError(`PhonePe auth failed (HTTP ${res.status})`, { status: res.status, transient: res.status >= 500 });
  const data = await res.json();
  if (!data.access_token) throw new PhonePeError('PhonePe auth response had no access_token');
  const type = data.token_type || 'O-Bearer';
  const token = `${type} ${data.access_token}`;
  // expires_at is an epoch timestamp (seconds per docs). Be defensive about ms vs s.
  let expMs = Number(data.expires_at) || 0;
  if (expMs && expMs < 1e12) expMs *= 1000;
  if (!expMs) expMs = Date.now() + 5 * 60_000;
  tokenCache.set(key, { token, expMs });
  return token;
}

async function authedFetch(cfg, fetchFn, url, init) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(cfg, fetchFn, { force: attempt === 1 });
    const res = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), Authorization: token } });
    if (res.status === 401 && attempt === 0) continue; // token revoked/expired early -> refresh once
    return res;
  }
  throw new PhonePeError('PhonePe rejected the access token', { status: 401, transient: false });
}

/** Create Payment (Standard Checkout, PG_CHECKOUT flow). Returns { orderId, redirectUrl, state }. */
export async function createPayment(cfg, { merchantOrderId, amountPaise, redirectUrl, message, expireAfter, productId }, fetchFn = fetch) {
  const res = await authedFetch(cfg, fetchFn, cfg.urls.pay, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      expireAfter,
      metaInfo: { udf1: productId },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message,
        merchantUrls: { redirectUrl },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.redirectUrl) {
    throw new PhonePeError(`PhonePe create payment failed (HTTP ${res.status}${data.code ? ` ${data.code}` : ''})`, {
      status: res.status, transient: res.status >= 500,
    });
  }
  return { orderId: data.orderId, redirectUrl: data.redirectUrl, state: data.state };
}

/**
 * Order Status API — the ONLY source of truth for "was this paid".
 * Returns { found, state, amount (paise, Number), orderId }.
 * state is one of PENDING | FAILED | COMPLETED (anything else is treated as PENDING by callers).
 */
export async function fetchOrderStatus(cfg, merchantOrderId, fetchFn = fetch) {
  const res = await authedFetch(cfg, fetchFn, `${cfg.urls.status(merchantOrderId)}?details=false`, { method: 'GET' });
  if (res.status === 404) return { found: false, state: 'PENDING', amount: 0, orderId: null };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // PhonePe answers unknown order ids with an error body ("No entry found ...")
    if (/no entry found/i.test(String(data.message || ''))) return { found: false, state: 'PENDING', amount: 0, orderId: null };
    throw new PhonePeError(`PhonePe order status failed (HTTP ${res.status})`, { status: res.status, transient: res.status >= 500 || res.status === 429 });
  }
  return {
    found: true,
    state: String(data.state || '').toUpperCase(),
    amount: Number(data.amount),
    orderId: data.orderId || null,
  };
}
