// POST /api/send-link { order_id, email } — emails the order-page link for a PAID order (optional feature).
// Limited to a few sends per order. Requires RESEND_API_KEY + EMAIL_FROM; otherwise returns 501 and nothing is sent.
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { isValidOrderId } from '../_lib/ids.js';
import { getOrder } from '../_lib/orders.js';
import { emailConfigured, isPlausibleEmail, sendDeliveryEmail } from '../_lib/email.js';
import { PRODUCT, ORDER_STATUS as S, MAX_EMAILS_PER_ORDER } from '../_lib/constants.js';

export async function handle({ request, env }, fetchFn = fetch) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!env.DB || !env.SITE_URL) return notConfigured(['DB binding or SITE_URL']);
  if (!emailConfigured(env)) return json({ error: 'email_not_configured' }, 501);

  const body = await request.json().catch(() => ({}));
  if (!isValidOrderId(body.order_id) || !isPlausibleEmail(body.email)) return json({ error: 'invalid_request' }, 400);

  const order = await getOrder(env, body.order_id);
  if (!order || order.status !== S.PAID) return json({ error: 'order_not_paid' }, 403); // paid status comes from verified server state only
  if (order.email_sent_count >= MAX_EMAILS_PER_ORDER) return json({ error: 'email_limit_reached' }, 429);

  // Reserve the send first (conditional update) so double-clicks cannot exceed the cap.
  const r = await env.DB.prepare('UPDATE orders SET email = ?, email_sent_count = email_sent_count + 1, updated_at = ? WHERE order_id = ? AND email_sent_count < ?')
    .bind(body.email, new Date().toISOString(), order.order_id, MAX_EMAILS_PER_ORDER).run();
  if (!r.meta || r.meta.changes !== 1) return json({ error: 'email_limit_reached' }, 429);

  try {
    await sendDeliveryEmail(env, { to: body.email, orderId: order.order_id, siteUrl: String(env.SITE_URL).replace(/\/+$/, ''), productName: PRODUCT.name }, fetchFn);
    return json({ ok: true });
  } catch (err) {
    console.error('send-link failed:', err.message);
    await env.DB.prepare('UPDATE orders SET email_sent_count = MAX(email_sent_count - 1, 0) WHERE order_id = ?').bind(order.order_id).run();
    return json({ error: 'email_failed' }, 502);
  }
}

export const onRequest = (ctx) => handle(ctx);
