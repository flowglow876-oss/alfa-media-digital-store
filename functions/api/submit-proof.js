// POST /api/submit-proof (multipart: order_id, screenshot) — verifies a UPI screenshot and, only if every rule passes,
// marks the QR order paid. Same screenshot or same UTR can never pay for a second order.
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { isValidOrderId } from '../_lib/ids.js';
import { getOrder } from '../_lib/orders.js';
import { sha256BytesHex } from '../_lib/crypto.js';
import { sniffImage, inspectImage, extractDual, consensus, evaluateProof, QR_MAX_IMAGE_BYTES } from '../_lib/qr.js';
import { ORDER_STATUS as S, QR_MAX_ATTEMPTS_PER_ORDER, QR_GLOBAL_CHECKS_PER_MIN } from '../_lib/constants.js';

const reject = (reason, status = 200) => json({ status: 'rejected', message: reason }, status);

export async function handle({ request, env }, fetchFn = fetch) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!env.DB || !env.GEMINI_API_KEY || !env.PAYEE_NAME || !env.DOWNLOAD_SIGNING_SECRET) {
    return notConfigured(['DB', 'GEMINI_API_KEY', 'PAYEE_NAME', 'DOWNLOAD_SIGNING_SECRET'].filter((k) => !env[k] && k !== 'DB'));
  }

  let form;
  try { form = await request.formData(); } catch { return reject('Invalid upload.', 400); }
  const orderId = form.get('order_id');
  const file = form.get('screenshot');
  if (!isValidOrderId(orderId) || !file || typeof file === 'string') return reject('Please choose a screenshot to upload.', 400);
  if (file.size > QR_MAX_IMAGE_BYTES) return reject('The image is too large (max 4 MB).', 413);

  const order = await getOrder(env, orderId);
  if (!order || order.payment_method !== 'qr') return reject('Order not found. Please start again.', 404);
  if (order.status === S.PAID) return json({ status: 'paid', orderId });
  if (order.status !== S.PENDING) return reject('This order can no longer accept a screenshot. Please start a new order.');
  if (order.proof_attempts >= QR_MAX_ATTEMPTS_PER_ORDER) return reject('Too many attempts for this order. Please contact support with your order reference.', 429);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return reject('Please upload a JPG, PNG or WebP screenshot.', 415);

  const forensic = inspectImage(bytes, mime);
  if (forensic) return reject(forensic);

  const burst = await env.DB.prepare('SELECT COUNT(*) AS n FROM payment_proofs WHERE created_at > ?').bind(new Date(Date.now() - 60_000).toISOString()).first();
  if (burst && burst.n >= QR_GLOBAL_CHECKS_PER_MIN) return reject('We are verifying many payments right now. Please try again in a minute.', 429);

  // Reserve an attempt first so concurrent/spam requests cannot exceed the cap.
  const reserved = await env.DB.prepare('UPDATE orders SET proof_attempts = proof_attempts + 1, updated_at = ? WHERE order_id = ? AND status = \'pending\' AND proof_attempts < ?')
    .bind(new Date().toISOString(), orderId, QR_MAX_ATTEMPTS_PER_ORDER).run();
  if (!reserved.meta || reserved.meta.changes !== 1) return reject('Too many attempts for this order. Please contact support with your order reference.', 429);

  const hash = await sha256BytesHex(bytes); // fingerprint of the exact image bytes
  const dupe = await env.DB.prepare('SELECT 1 AS x FROM payment_proofs WHERE sha256 = ?').bind(hash).first();
  if (dupe) return reject('This screenshot has already been submitted. Please pay and upload your own new screenshot.');

  let extracted, dual;
  try {
    dual = await extractDual(env, bytes, mime, fetchFn);   // two independent AI reads, in parallel
    const cc = consensus(dual.reader, dual.auditor);       // they must agree; any tamper flag from either blocks
    extracted = cc.ok ? cc.merged : dual.reader;
    if (!cc.ok) dual.disagree = cc.reason;
  } catch (err) {
    console.error('proof extraction failed:', err.message);
    await env.DB.prepare('UPDATE orders SET proof_attempts = MAX(proof_attempts - 1, 0) WHERE order_id = ?').bind(orderId).run();
    return json({ status: 'error', message: 'Verification is temporarily unavailable. Please try again in a minute.' }, 503);
  }

  const ctx = {
    orderCreatedAtMs: Date.parse(order.created_at), nowMs: Date.now(), payeeName: env.PAYEE_NAME, upiId: env.UPI_ID,
  };
  const verdict = dual.disagree ? { ok: false, reason: dual.disagree } : evaluateProof(extracted, ctx);
  const store = (result, reason, utr) => env.DB.prepare(
    'INSERT INTO payment_proofs (sha256, order_id, utr, result, reason, extracted) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(hash, orderId, utr, result, reason, JSON.stringify({ final: extracted, auditor: dual.auditor || null }).slice(0, 2000)).run();

  if (!verdict.ok) {
    try { await store('rejected', verdict.reason, null); } catch { /* duplicate race: ignore */ }
    return reject(verdict.reason);
  }

  // UNIQUE(utr) + UNIQUE(sha256): if this UTR/screenshot already paid another order, the insert fails and we reject.
  try { await store('accepted', null, verdict.utr); } catch {
    return reject('This payment reference has already been used for another order.');
  }
  const t = new Date().toISOString();
  await env.DB.prepare(`UPDATE orders SET status = 'paid', phonepe_state = 'QR_SCREENSHOT_VERIFIED', paid_at = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'`)
    .bind(t, t, orderId).run();
  return json({ status: 'paid', orderId });
}
export const onRequest = (ctx) => handle(ctx);
