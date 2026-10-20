// POST /api/create-checkout  — creates (or safely reuses) a server-side ₹399 order and returns { orderId, checkoutUrl }.
// The browser never chooses the price: any amount in the request body is ignored.
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { loadPhonePeConfig } from '../_lib/phonepe-config.js';
import { PRODUCT, ORDER_STATUS as S, PHONEPE_ORDER_EXPIRE_SECONDS } from '../_lib/constants.js';
import { newOrderId, isValidOrderId } from '../_lib/ids.js';
import { createPayment, PhonePeError } from '../_lib/phonepe.js';
import { getOrder, insertOrder, attachPhonePeOrder, markCreateFailed, settleOrder } from '../_lib/orders.js';

export async function handle({ request, env }, fetchFn = fetch) {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const body = await request.json().catch(() => ({}));
  if (body.productId && body.productId !== PRODUCT.id) return json({ error: 'unknown_product' }, 400);

  const loaded = loadPhonePeConfig(env);
  if (!loaded.ok || !env.DB) return notConfigured(loaded.ok ? ['DB binding'] : loaded.missing);
  const cfg = loaded.config;

  // --- Retry / double-click safety -------------------------------------------------------------
  // If the browser tells us which order it tried last, never create a second one while the first is still usable.
  const retryOf = isValidOrderId(body.retryOf) ? body.retryOf : null;
  if (retryOf) {
    let prev = await getOrder(env, retryOf);
    if (prev) {
      try { prev = await settleOrder(env, cfg, prev, { fetchFn, force: true }); } catch { /* keep what we have */ }
      if (prev.status === S.PAID || prev.status === S.REVIEW) {
        // Customer already paid (late confirmation): send them to the order page, NOT to pay again.
        return json({ orderId: prev.order_id, checkoutUrl: `${cfg.siteUrl}/success.html?order_id=${prev.order_id}`, alreadyPaid: true });
      }
      const stillOpen = prev.status === S.PENDING && prev.redirect_url && prev.expires_at && Date.parse(prev.expires_at) - Date.now() > 60_000;
      if (stillOpen) return json({ orderId: prev.order_id, checkoutUrl: prev.redirect_url, reused: true });
      // failed or expired -> fall through and create a fresh order
    }
  }

  // --- New order -------------------------------------------------------------------------------
  const orderId = newOrderId();
  const expiresAtIso = new Date(Date.now() + PHONEPE_ORDER_EXPIRE_SECONDS * 1000).toISOString();
  await insertOrder(env, { orderId, environment: cfg.mode, expiresAtIso });

  try {
    const pay = await createPayment(cfg, {
      merchantOrderId: orderId,
      amountPaise: PRODUCT.amountPaise,
      redirectUrl: `${cfg.siteUrl}/success.html?order_id=${orderId}`,
      message: PRODUCT.name,
      expireAfter: PHONEPE_ORDER_EXPIRE_SECONDS,
      productId: PRODUCT.id,
    }, fetchFn);
    await attachPhonePeOrder(env, orderId, pay.orderId, pay.redirectUrl);
    return json({ orderId, checkoutUrl: pay.redirectUrl });
  } catch (err) {
    await markCreateFailed(env, orderId);
    console.error('create-checkout failed:', err instanceof PhonePeError ? err.message : 'unexpected error');
    return json({ error: 'checkout_unavailable', message: 'Unable to start payment right now. Please try again.' }, 502);
  }
}

export const onRequest = (ctx) => handle(ctx);
