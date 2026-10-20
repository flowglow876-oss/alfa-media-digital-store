// POST /api/qr-order { retryOf? } — opens (or reuses) a QR-payment order for ₹399. Price is fixed server-side.
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { newOrderId, isValidOrderId } from '../_lib/ids.js';
import { getOrder, insertOrder } from '../_lib/orders.js';
import { ORDER_STATUS as S, QR_ORDER_REUSE_MINUTES, QR_MAX_ATTEMPTS_PER_ORDER, QR_GLOBAL_ORDERS_PER_MIN } from '../_lib/constants.js';

export async function handle({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!env.DB) return notConfigured(['DB binding']);
  const body = await request.json().catch(() => ({}));

  if (isValidOrderId(body.retryOf)) {
    const prev = await getOrder(env, body.retryOf);
    if (prev && prev.payment_method === 'qr') {
      if (prev.status === S.PAID) return json({ orderId: prev.order_id, alreadyPaid: true });
      const fresh = Date.now() - Date.parse(prev.created_at) < QR_ORDER_REUSE_MINUTES * 60_000;
      if (prev.status === S.PENDING && fresh && prev.proof_attempts < QR_MAX_ATTEMPTS_PER_ORDER) return json({ orderId: prev.order_id, reused: true });
    }
  }
  const since = new Date(Date.now() - 60_000).toISOString();
  const burst = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE payment_method = 'qr' AND created_at > ?").bind(since).first();
  if (burst && burst.n >= QR_GLOBAL_ORDERS_PER_MIN) return json({ error: 'busy', message: 'Too many requests right now. Please try again in a minute.' }, 429);
  const orderId = newOrderId();
  await insertOrder(env, { orderId, environment: 'production', expiresAtIso: null, paymentMethod: 'qr' });
  return json({ orderId });
}
export const onRequest = (ctx) => handle(ctx);
