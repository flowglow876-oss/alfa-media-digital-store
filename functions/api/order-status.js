// GET /api/order-status?order_id=ALFA-...  → { status: paid|pending|failed, downloadUrl?, expiresIn? }
// "paid" is returned ONLY after the server confirmed COMPLETED + ₹399 with PhonePe's Order Status API.
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { loadPhonePeConfig } from '../_lib/phonepe-config.js';
import { ORDER_STATUS as S, DOWNLOAD_LINK_TTL_SECONDS } from '../_lib/constants.js';
import { isValidOrderId } from '../_lib/ids.js';
import { getOrder, settleOrder, issueDownloadToken } from '../_lib/orders.js';
import { emailConfigured } from '../_lib/email.js';

export async function handle({ request, env }, fetchFn = fetch) {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  const orderId = new URL(request.url).searchParams.get('order_id');
  if (!isValidOrderId(orderId)) return json({ status: 'failed', message: 'Invalid order reference.' }, 404);

  if (!env.DB || !env.DOWNLOAD_SIGNING_SECRET) return notConfigured(['DB binding or DOWNLOAD_SIGNING_SECRET']);
  let order = await getOrder(env, orderId);
  if (!order) return json({ status: 'failed', message: 'No record found for this order reference.' }, 404);

  // QR orders never touch PhonePe; PhonePe orders need the PhonePe config to be verified.
  let cfg = { signingSecret: env.DOWNLOAD_SIGNING_SECRET };
  if (order.payment_method !== 'qr') {
    const loaded = loadPhonePeConfig(env);
    if (!loaded.ok) return notConfigured(loaded.missing);
    cfg = loaded.config;
  }

  try {
    order = await settleOrder(env, cfg, order, { fetchFn });
  } catch (err) {
    // PhonePe unreachable: fail safe. Never claim paid, never claim failed.
    console.error('order-status verification error:', err.message);
    if (order.status !== S.PAID) {
      return json({ status: 'pending', orderId, message: 'Payment verification pending. We could not reach the payment provider just now.' });
    }
  }

  if (order.status === S.PAID) {
    const link = await issueDownloadToken(env, cfg, order);
    if (!link) return json({ status: 'paid', orderId, message: 'Too many download links were requested. Please contact support with your order reference.' });
    return json({
      status: 'paid',
      orderId,
      downloadUrl: link.url,
      expiresIn: `${DOWNLOAD_LINK_TTL_SECONDS / 60} minutes`,
      emailAvailable: emailConfigured(env),
      emailSent: order.email_sent_count > 0,
    });
  }
  if (order.status === S.FAILED) {
    return json({ status: 'failed', orderId, canRetry: true, message: 'The payment was not completed and no money was taken for this order. You can try again.' });
  }
  if (order.status === S.REVIEW) {
    return json({ status: 'pending', orderId, message: 'Your payment needs a manual check. Please contact support and quote your order reference.' });
  }
  return json({ status: 'pending', orderId, message: 'Payment verification pending.' });
}

export const onRequest = (ctx) => handle(ctx);
