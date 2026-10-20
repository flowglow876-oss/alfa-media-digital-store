// POST /api/phonepe-webhook — PhonePe server-to-server notification.
// 1) Authenticate: Authorization header must equal SHA256("username:password") (as configured in PhonePe dashboard).
// 2) NEVER trust the body's "state": it only tells us WHICH order to re-check. The decision comes from Order Status API.
// 3) Idempotent: duplicates/replays/out-of-order events are harmless (paid is final, conditional UPDATEs).
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { loadPhonePeConfig } from '../_lib/phonepe-config.js';
import { sha256Hex, safeEqual } from '../_lib/crypto.js';
import { isValidOrderId } from '../_lib/ids.js';
import { getOrder, settleOrder } from '../_lib/orders.js';
import { ORDER_STATUS as S } from '../_lib/constants.js';

export async function handle({ request, env }, fetchFn = fetch) {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const loaded = loadPhonePeConfig(env);
  if (!loaded.ok || !env.DB) return notConfigured(loaded.ok ? ['DB binding'] : loaded.missing);
  const cfg = loaded.config;

  const expected = await sha256Hex(`${cfg.webhookUsername}:${cfg.webhookPassword}`);
  const supplied = (request.headers.get('authorization') || '').trim().replace(/^(sha256|basic)\s+/i, '').toLowerCase();
  if (!supplied || !safeEqual(supplied, expected)) return json({ error: 'unauthorized' }, 401);

  const raw = await request.text();
  if (raw.length > 100_000) return json({ error: 'too_large' }, 413);
  let msg;
  try { msg = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }

  const event = String(msg.event || msg.type || '');
  const p = msg.payload || msg;
  if (/refund/i.test(event)) return json({ ok: true, ignored: 'refund_event' }); // refunds are handled manually (see docs)

  const merchantOrderId = p.merchantOrderId || p.originalMerchantOrderId;
  if (!isValidOrderId(merchantOrderId)) return json({ ok: true, ignored: 'unknown_order' }); // 200 so PhonePe stops retrying
  const order = await getOrder(env, merchantOrderId);
  if (!order) return json({ ok: true, ignored: 'unknown_order' });

  const eventKey = await sha256Hex(`${event}|${merchantOrderId}|${p.state || ''}|${p.orderId || ''}`);
  const seen = await env.DB.prepare('SELECT 1 AS x FROM webhook_events WHERE event_key = ?').bind(eventKey).first();
  if (seen && order.status !== S.PENDING) return json({ ok: true, duplicate: true });

  try {
    await settleOrder(env, cfg, order, { fetchFn, force: true });
  } catch (err) {
    console.error('webhook verification error:', err.message);
    return json({ error: 'verification_unavailable' }, 503); // non-2xx => PhonePe retries later
  }
  await env.DB.prepare('INSERT OR IGNORE INTO webhook_events (event_key, order_id, event_type, state) VALUES (?, ?, ?, ?)')
    .bind(eventKey, merchantOrderId, event.slice(0, 80), String(p.state || '').slice(0, 40)).run();
  return json({ ok: true });
}

export const onRequest = (ctx) => handle(ctx);
