// Order persistence + the single "is this really paid?" decision point (settleOrder).
import { PRODUCT, ORDER_STATUS as S, STATUS_CHECK_MIN_INTERVAL_MS, DOWNLOAD_LINK_TTL_SECONDS, MAX_LINKS_PER_ORDER, MAX_DOWNLOADS_PER_LINK } from './constants.js';
import { fetchOrderStatus } from './phonepe.js';
import { signToken, randomId } from './crypto.js';

const nowIso = () => new Date().toISOString();

export const getOrder = (env, orderId) =>
  env.DB.prepare('SELECT * FROM orders WHERE order_id = ?').bind(orderId).first();

export async function insertOrder(env, { orderId, environment, expiresAtIso, paymentMethod = 'phonepe' }) {
  await env.DB.prepare(
    `INSERT INTO orders (order_id, product_id, amount_paise, currency, status, environment, expires_at, payment_method)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(orderId, PRODUCT.id, PRODUCT.amountPaise, PRODUCT.currency, environment, expiresAtIso, paymentMethod).run();
}

export const attachPhonePeOrder = (env, orderId, phonepeOrderId, redirectUrl) =>
  env.DB.prepare(`UPDATE orders SET phonepe_order_id = ?, redirect_url = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'`)
    .bind(phonepeOrderId || null, redirectUrl, nowIso(), orderId).run();

export const markCreateFailed = (env, orderId) =>
  env.DB.prepare(`UPDATE orders SET status = 'failed', phonepe_state = 'CREATE_FAILED', updated_at = ? WHERE order_id = ? AND status = 'pending'`)
    .bind(nowIso(), orderId).run();

/**
 * Ask PhonePe (server-to-server) what really happened and update our row.
 * Rules:
 *  - Only state === COMPLETED can ever produce `paid`.
 *  - The amount PhonePe reports must equal the amount we stored AND the fixed product price (₹399 = 39900 paise).
 *  - If PhonePe's own orderId is already stored, it must match (blocks cross-order mix-ups).
 *  - paid is final: a late/duplicate FAILED/PENDING signal can never downgrade or re-trigger it.
 * Throws PhonePeError on network/5xx so callers can retry later (webhook -> 5xx -> PhonePe retries).
 */
export async function settleOrder(env, cfg, order, { fetchFn = fetch, force = false } = {}) {
  if (order.payment_method === 'qr') return order; // QR orders are settled only by /api/submit-proof, never by PhonePe polling
  if (order.status === S.PAID || order.status === S.REVIEW) return order;
  if (order.status === S.FAILED) {
    // A "failed" order can still turn out paid if the customer's bank confirms late; re-check once on demand.
    if (!force) return order;
  }
  if (!force && order.last_checked_at && Date.now() - Date.parse(order.last_checked_at) < STATUS_CHECK_MIN_INTERVAL_MS) return order;

  const res = await fetchOrderStatus(cfg, order.order_id, fetchFn);
  const t = nowIso();

  if (res.state === 'COMPLETED') {
    const amountOk = Number.isInteger(res.amount) && res.amount === order.amount_paise && res.amount === PRODUCT.amountPaise;
    const idOk = !order.phonepe_order_id || !res.orderId || order.phonepe_order_id === res.orderId;
    if (amountOk && idOk) {
      // Conditional update => exactly one caller flips pending->paid (webhook + polling can race safely).
      await env.DB.prepare(
        `UPDATE orders SET status = 'paid', phonepe_state = 'COMPLETED', paid_at = COALESCE(paid_at, ?), last_checked_at = ?, updated_at = ?
         WHERE order_id = ? AND status IN ('pending','failed')`
      ).bind(t, t, t, order.order_id).run();
    } else {
      await env.DB.prepare(
        `UPDATE orders SET status = 'review', phonepe_state = ?, last_checked_at = ?, updated_at = ?
         WHERE order_id = ? AND status IN ('pending','failed')`
      ).bind(amountOk ? 'ID_MISMATCH' : 'AMOUNT_MISMATCH', t, t, order.order_id).run();
    }
  } else if (res.state === 'FAILED') {
    await env.DB.prepare(
      `UPDATE orders SET status = 'failed', phonepe_state = 'FAILED', last_checked_at = ?, updated_at = ?
       WHERE order_id = ? AND status = 'pending'`
    ).bind(t, t, order.order_id).run();
  } else {
    await env.DB.prepare(
      `UPDATE orders SET phonepe_state = ?, last_checked_at = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'`
    ).bind(res.found ? 'PENDING' : 'NOT_STARTED', t, t, order.order_id).run();
  }
  return getOrder(env, order.order_id);
}

/** Mint a short-lived signed download token. Caller MUST have confirmed order.status === 'paid'. */
export async function issueDownloadToken(env, cfg, order) {
  if (order.status !== S.PAID) throw new Error('refusing to issue a download token for an unpaid order');
  // Reuse a still-valid link instead of minting a new one on every refresh (stops customers burning the per-order cap).
  const live = await env.DB.prepare('SELECT jti, expires_at FROM download_tokens WHERE order_id = ? AND expires_at > ? AND uses < ? ORDER BY expires_at DESC LIMIT 1')
    .bind(order.order_id, nowIso(), MAX_DOWNLOADS_PER_LINK).first();
  if (live) {
    const lexp = Math.floor(Date.parse(live.expires_at) / 1000);
    const ltoken = await signToken({ jti: live.jti, oid: order.order_id, exp: lexp }, cfg.signingSecret);
    return { token: ltoken, url: `/api/download?token=${encodeURIComponent(ltoken)}`, expiresInSeconds: Math.max(1, lexp - Math.floor(Date.now() / 1000)) };
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM download_tokens WHERE order_id = ?').bind(order.order_id).first();
  if (count && count.n >= MAX_LINKS_PER_ORDER) return null;
  const jti = randomId(16);
  const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_LINK_TTL_SECONDS;
  await env.DB.prepare('INSERT INTO download_tokens (jti, order_id, expires_at) VALUES (?, ?, ?)')
    .bind(jti, order.order_id, new Date(exp * 1000).toISOString()).run();
  const token = await signToken({ jti, oid: order.order_id, exp }, cfg.signingSecret);
  return { token, url: `/api/download?token=${encodeURIComponent(token)}`, expiresInSeconds: DOWNLOAD_LINK_TTL_SECONDS };
}
