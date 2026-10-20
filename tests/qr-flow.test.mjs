import test from 'node:test';
import assert from 'node:assert/strict';
import { handle as qrOrder } from '../functions/api/qr-order.js';
import { handle as submitProof } from '../functions/api/submit-proof.js';
import { handle as orderStatus } from '../functions/api/order-status.js';
import { handle as download } from '../functions/api/download.js';
import { evaluateProof, parsePaidAtIst } from '../functions/_lib/qr.js';
import { makeDb, req, postJson } from './helpers.mjs';

// QR mode env: NO PhonePe variables at all.
const qrEnv = () => ({
  DB: makeDb(), GEMINI_API_KEY: 'test-key', PAYEE_NAME: 'Manoj', DOWNLOAD_SIGNING_SECRET: 'unit-test-signing-secret',
  BUNDLE_BUCKET: { get: async () => ({ body: new Blob(['PK-fake-zip']).stream() }) },
});
const ist = (offsetMs = 0) => new Date(Date.now() + offsetMs + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const good = (o = {}) => ({ is_payment_screenshot: true, status: 'success', amount_inr: 399, payee_name: 'MANOJ KUMAR', payee_upi_id: null,
  utr: '412345678901', paid_at: ist(), app: 'PhonePe', looks_edited: false, looks_ai_generated: false, is_photo_of_screen: false, confidence: 0.95, ...o });
const vision = (obj, calls = []) => async (url, init) => {
  calls.push(url);
  if (obj === 'down') return new Response('{}', { status: 500 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
};
let seed = 1;
const png = () => { const b = new Uint8Array(200); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 56, 0, 0, 9, 42], 0); b[100] = seed++ % 250; b[101] = (seed >> 3) % 250; b[150] = seed % 7; return b; };
const upload = (env, orderId, bytes, fetchFn, type = 'image/png') => {
  const form = new FormData();
  form.append('order_id', orderId);
  form.append('screenshot', new File([bytes], 'shot.png', { type }));
  return submitProof({ request: new Request('https://shop.test/api/submit-proof', { method: 'POST', body: form }), env }, fetchFn);
};
const newOrder = async (env) => (await (await qrOrder({ request: postJson('/api/qr-order', {}), env })).json()).orderId;
const status = async (env, id) => (await orderStatus({ request: req(`/api/order-status?order_id=${id}`), env })).json();

test('QR happy path (no PhonePe config needed): verified screenshot -> paid -> signed download streams ZIP', async () => {
  seed += 10; const env = qrEnv(); const id = await newOrder(env);
  const before = await status(env, id);
  assert.equal(before.status, 'pending'); assert.ok(!('downloadUrl' in before));
  const r = await (await upload(env, id, png(), vision(good()))).json();
  assert.equal(r.status, 'paid');
  const s = await status(env, id);
  assert.equal(s.status, 'paid'); assert.match(s.downloadUrl, /^\/api\/download\?token=/);
  const d = await download({ request: req(s.downloadUrl), env });
  assert.equal(d.status, 200); assert.equal(await d.text(), 'PK-fake-zip');
});

test('KV fallback: paid orders stream the private ZIP from BUNDLE_KV when R2 is not configured', async () => {
  seed += 4;
  const env = qrEnv();
  delete env.BUNDLE_BUCKET;
  let keySeen = null, typeSeen = null;
  env.BUNDLE_KV = {
    get: async (key, type) => {
      keySeen = key; typeSeen = type;
      return new Blob(['PK-kv-zip-bytes']).stream();
    },
  };
  const id = await newOrder(env);
  const paid = await (await upload(env, id, png(), vision(good()))).json();
  assert.equal(paid.status, 'paid');
  const s = await status(env, id);
  const d = await download({ request: req(s.downloadUrl), env });
  assert.equal(d.status, 200);
  assert.equal(keySeen, 'bundles/online-business-blueprint-7-guides.zip');
  assert.equal(typeSeen, 'stream');
  assert.equal(d.headers.get('content-type'), 'application/zip');
  assert.equal(await d.text(), 'PK-kv-zip-bytes');
});

test('every rule rejects: wrong amount / payee / status / missing UTR / old time / edited / low confidence / not a screenshot', async () => {
  const bads = [
    good({ amount_inr: 39 }), good({ payee_name: 'Someone Else' }), good({ status: 'failed' }), good({ utr: null }), good({ utr: '12345' }),
    good({ paid_at: ist(-3 * 3600_000) }), good({ paid_at: null }), good({ looks_edited: true }), good({ confidence: 0.3 }),
    good({ is_payment_screenshot: false }), good({ paid_at: ist(60 * 60_000) }),
    good({ looks_ai_generated: true }), good({ is_photo_of_screen: true }), good({ looks_ai_generated: undefined }),
  ];
  for (const bad of bads) {
    seed += 7; const env = qrEnv(); const id = await newOrder(env);
    const r = await (await upload(env, id, png(), vision(bad))).json();
    assert.equal(r.status, 'rejected', JSON.stringify(bad));
    assert.equal((await status(env, id)).status, 'pending');
  }
});

test('same screenshot twice, or same UTR on a second order, cannot pay again', async () => {
  seed += 3; const env = qrEnv();
  const a = await newOrder(env), b = await newOrder(env), c = await newOrder(env);
  const bytes = png();
  assert.equal((await (await upload(env, a, bytes, vision(good()))).json()).status, 'paid');
  assert.equal((await (await upload(env, b, bytes, vision(good()))).json()).status, 'rejected');          // identical image
  const different = png(); different[120] = 9;
  const r = await (await upload(env, c, different, vision(good()))).json();                               // same UTR, new image
  assert.equal(r.status, 'rejected'); assert.match(r.message, /already been used/);
  assert.equal((await status(env, b)).status, 'pending'); assert.equal((await status(env, c)).status, 'pending');
});

test('attempt cap (5), non-images, oversize, unknown order, and vision outage handled safely', async () => {
  seed += 5; const env = qrEnv(); const id = await newOrder(env);
  for (let i = 0; i < 5; i++) assert.equal((await (await upload(env, id, png(), vision(good({ status: 'failed' })))).json()).status, 'rejected');
  assert.equal((await upload(env, id, png(), vision(good()))).status, 429);

  const e2 = qrEnv(); const id2 = await newOrder(e2);
  assert.equal((await upload(e2, id2, new TextEncoder().encode('<html>not an image</html>'.repeat(10)), vision(good()))).status, 415);
  assert.equal((await upload(e2, id2, new Uint8Array(5 * 1024 * 1024), vision(good()))).status, 413);
  const out = await upload(e2, id2, png(), vision('down'));
  assert.equal(out.status, 503);
  assert.equal(e2.DB.raw.prepare('SELECT proof_attempts n FROM orders').get().n, 0, 'outage must not burn an attempt');
  assert.equal((await upload(e2, 'ALFA-' + 'B'.repeat(32), png(), vision(good()))).status, 404);
});

test('QR order is reused (no duplicate orders on repeat clicks); not-configured fails closed', async () => {
  const env = qrEnv(); const id = await newOrder(env);
  const again = await (await qrOrder({ request: postJson('/x', { retryOf: id }), env })).json();
  assert.equal(again.orderId, id); assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
  const calls = [];
  const r = await upload({ ...env, GEMINI_API_KEY: undefined }, id, png(), vision(good(), calls));
  assert.equal(r.status, 503); assert.equal(calls.length, 0);
});

test('evaluateProof is pure and IST-aware', () => {
  const now = Date.parse('2026-10-20T10:00:00Z'); // 15:30 IST
  assert.equal(parsePaidAtIst('2026-10-20 15:30'), now);
  const ctx = { orderCreatedAtMs: now - 60_000, nowMs: now, payeeName: 'Manoj' };
  assert.equal(evaluateProof(good({ paid_at: '2026-10-20 15:29' }), ctx).ok, true);
  assert.equal(evaluateProof(good({ paid_at: '2026-10-20 09:59' }), ctx).ok, false); // same clock digits but UTC-misread would pass
  assert.equal(evaluateProof(good({ payee_upi_id: 'x@y' }), { ...ctx, upiId: 'manoj@ok' }).ok, false);
});

test('forensics: square/landscape images and files with editor or AI-generator markers are rejected without calling the AI', async () => {
  seed += 9; const env = qrEnv(); const id = await newOrder(env); const calls = [];
  const square = png(); square.set([0, 0, 4, 0, 0, 0, 4, 0], 16);                 // 1024x1024
  assert.equal((await (await upload(env, id, square, vision(good(), calls))).json()).status, 'rejected');
  const marked = png(); marked.set(new TextEncoder().encode('Adobe Photoshop'), 60);
  assert.equal((await (await upload(env, id, marked, vision(good(), calls))).json()).status, 'rejected');
  const c2pa = png(); c2pa.set(new TextEncoder().encode('c2pa'), 70);
  assert.equal((await (await upload(env, id, c2pa, vision(good(), calls))).json()).status, 'rejected');
  assert.equal(calls.length, 0); assert.equal((await status(env, id)).status, 'pending');
});

// ---- Dual-AI cross-check (reader + independent auditor) ----
// Router: odd call = reader prompt, auditor is identified by its system prompt text.
const dualVision = (reader, auditor) => async (url, init) => {
  const sys = JSON.parse(init.body).systemInstruction.parts[0].text;
  const obj = sys.includes('independent forensic auditor') ? auditor : reader;
  if (obj === 'down') return new Response('{}', { status: 500 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
};
const tryPay = async (reader, auditor, envMut) => {
  seed += 13; const env = qrEnv(); if (envMut) envMut(env); const id = await newOrder(env);
  const r = await (await upload(env, id, png(), dualVision(reader, auditor))).json();
  return { r, st: (await status(env, id)).status };
};

test('dual AI: both reads agree -> paid', async () => {
  const { r, st } = await tryPay(good(), good({ utr: '412 345 678 901', payee_name: 'Manoj Kumar' }));
  assert.equal(r.status, 'paid'); assert.equal(st, 'paid');
});

test('dual AI: auditor sees a different UTR / amount / time / status -> rejected, stays locked', async () => {
  for (const diff of [{ utr: '412345678902' }, { amount_inr: 400 }, { paid_at: ist(-60 * 60_000) }, { status: 'pending' }, { payee_name: 'Ravi' }]) {
    const { r, st } = await tryPay(good(), good(diff));
    assert.equal(r.status, 'rejected', JSON.stringify(diff)); assert.equal(st, 'pending');
  }
});

test('dual AI: a tamper flag from EITHER read blocks payment', async () => {
  for (const flag of ['looks_edited', 'looks_ai_generated', 'is_photo_of_screen']) {
    const a = await tryPay(good(), good({ [flag]: true })); assert.equal(a.r.status, 'rejected', 'auditor ' + flag);
    const b = await tryPay(good({ [flag]: true }), good()); assert.equal(b.r.status, 'rejected', 'reader ' + flag);
  }
});

test('dual AI: auditor outage falls back; single-read mode works; total outage -> 503', async () => {
  assert.equal((await tryPay(good(), 'down')).r.status, 'paid');
  assert.equal((await tryPay(good(), 'down', (e) => { e.GEMINI_MODEL_2 = 'x'; })).r.status, 'paid');
  assert.equal((await tryPay(good({ utr: '999999999999' }), good(), (e) => { e.GEMINI_DOUBLE_CHECK = 'off'; })).r.status, 'rejected'); // single read still obeys the UTR sanity rule
  assert.equal((await tryPay(good(), good(), (e) => { e.GEMINI_DOUBLE_CHECK = 'off'; })).r.status, 'paid');
  assert.equal((await tryPay('down', 'down')).r.status, 'error');
});

test('UTR sanity: fake-looking references are rejected', () => {
  const ctx = { orderCreatedAtMs: Date.now() - 60_000, nowMs: Date.now(), payeeName: 'Manoj' };
  for (const utr of ['111111111111', '123456789012', '987654321098', '123123123123', '121212121212', '123456123456']) {
    assert.equal(evaluateProof(good({ utr }), ctx).ok, false, utr);
  }
  assert.equal(evaluateProof(good({ utr: '412345678901' }), ctx).ok, true);
});
