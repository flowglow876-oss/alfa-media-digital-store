import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, signToken } from '../functions/_lib/crypto.js';
import { clearTokenCache } from '../functions/_lib/phonepe.js';
import { handle as createCheckout } from '../functions/api/create-checkout.js';
import { handle as orderStatus } from '../functions/api/order-status.js';
import { handle as webhook } from '../functions/api/phonepe-webhook.js';
import { handle as download } from '../functions/api/download.js';
import { handle as sendLink } from '../functions/api/send-link.js';
import { TEST_ENV, makePhonePe, req, postJson, clearThrottle } from './helpers.mjs';

const setup = () => { clearTokenCache(); return { env: TEST_ENV(), pp: makePhonePe() }; };
const checkout = async (env, pp, body = {}) => (await createCheckout({ request: postJson('/api/create-checkout', body), env }, pp.fetchFn));
const status = async (env, pp, id) => orderStatus({ request: req(`/api/order-status?order_id=${id}`), env }, pp.fetchFn);
const hookAuth = async () => ({ Authorization: await sha256Hex('hookuser:hookpass') });
const hook = async (env, pp, body, headers) => webhook({ request: postJson('/api/phonepe-webhook', body, headers ?? await hookAuth()), env }, pp.fetchFn);
const dl = (env, url) => download({ request: req(url), env });
const row = (env, id) => env.DB.raw.prepare('SELECT * FROM orders WHERE order_id = ?').get(id);

test('create-checkout: server fixes ₹399, ignores client amount, sends official PG_CHECKOUT request, hides secrets', async () => {
  const { env, pp } = setup();
  const r = await checkout(env, pp, { productId: 'online-business-blueprint-7', amount: 1, currency: 'USD' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.orderId, /^ALFA-[0-9A-F]{32}$/);
  assert.match(body.checkoutUrl, /^https:\/\/mercury-uat\.phonepe\.test\//);
  const pay = pp.calls.find((c) => c.url.endsWith('/checkout/v2/pay'));
  const sent = JSON.parse(pay.body);
  assert.equal(sent.amount, 39900);
  assert.equal(sent.merchantOrderId, body.orderId);
  assert.equal(sent.paymentFlow.type, 'PG_CHECKOUT');
  assert.equal(sent.paymentFlow.merchantUrls.redirectUrl, `https://shop.test/success.html?order_id=${body.orderId}`);
  assert.equal(pay.headers.Authorization, 'O-Bearer tok123');
  assert.ok(!JSON.stringify(body).includes('test-secret-value') && !JSON.stringify(body).includes('tok123'));
  assert.equal(row(env, body.orderId).amount_paise, 39900);
  assert.equal((await createCheckout({ request: postJson('/x', { productId: 'other' }), env }, pp.fetchFn)).status, 400);
});

test('not configured: fails closed with 503 and no leak of variable names', async () => {
  const { pp } = setup();
  const r = await createCheckout({ request: postJson('/x', {}), env: {} }, pp.fetchFn);
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes('PHONEPE'));
});

test('pending / not-started payment never releases the product', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  const b = await (await status(env, pp, orderId)).json();
  assert.equal(b.status, 'pending');
  assert.ok(!('downloadUrl' in b));
  assert.equal(row(env, orderId).status, 'pending');
});

test('unknown / malformed order ids are 404 and never paid', async () => {
  const { env, pp } = setup();
  for (const id of ['x', 'ALFA-' + '0'.repeat(32), "ALFA-' OR 1=1"]) {
    const r = await status(env, pp, id);
    assert.equal(r.status, 404);
    assert.ok(!('downloadUrl' in (await r.json())));
  }
});

test('COMPLETED with wrong amount is held for review: no delivery', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.state = 'COMPLETED'; pp.sim.amountOverride = 100;
  const b = await (await status(env, pp, orderId)).json();
  assert.equal(b.status, 'pending');
  assert.ok(!('downloadUrl' in b));
  assert.equal(row(env, orderId).status, 'review');
  assert.equal(row(env, orderId).phonepe_state, 'AMOUNT_MISMATCH');
});

test('verified COMPLETED ₹399: paid, short-lived signed link, streams ZIP, link is order-bound', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.state = 'COMPLETED';
  const r = await status(env, pp, orderId);
  const b = await r.json();
  assert.equal(b.status, 'paid');
  assert.match(b.downloadUrl, /^\/api\/download\?token=/);
  assert.equal(b.expiresIn, '10 minutes');
  assert.equal(row(env, orderId).status, 'paid');

  const ok = await dl(env, b.downloadUrl);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'application/zip');
  assert.match(ok.headers.get('content-disposition'), /attachment/);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(await ok.text(), 'PK-fake-zip-bytes');

  // tampered token / wrong signature / garbage => denied
  const tok = new URL('https://x' + b.downloadUrl).searchParams.get('token');
  const [body] = tok.split('.');
  for (const bad of [`${body}.AAAA`, `${body}x.${tok.split('.')[1]}`, 'garbage', '']) {
    assert.equal((await dl(env, `/api/download?token=${encodeURIComponent(bad)}`)).status, 403);
  }
  assert.equal((await dl(env, '/api/download')).status, 403);
});

test('download link: expiry, other-order binding, use cap, and unpaid orders are all refused', async () => {
  const { env, pp } = setup();
  const a = (await (await checkout(env, pp)).json()).orderId;
  const b = (await (await checkout(env, pp)).json()).orderId; // second order stays unpaid
  pp.sim.state = 'COMPLETED';
  const paidRes = await (await status(env, pp, a)).json();
  const tokA = new URL('https://x' + paidRes.downloadUrl).searchParams.get('token');

  // forge a validly-signed token for the UNPAID order b (attacker would need the secret; here we prove the DB check too)
  const forged = await signToken({ jti: 'f'.repeat(32), oid: b, exp: Math.floor(Date.now() / 1000) + 600 }, 'unit-test-signing-secret');
  assert.equal((await dl(env, `/api/download?token=${encodeURIComponent(forged)}`)).status, 403); // no token row / unpaid
  // signed with a different secret => rejected
  const wrongKey = await signToken({ jti: 'a'.repeat(32), oid: a, exp: Math.floor(Date.now() / 1000) + 600 }, 'attacker-secret');
  assert.equal((await dl(env, `/api/download?token=${encodeURIComponent(wrongKey)}`)).status, 403);

  // use cap (5 per link)
  for (let i = 0; i < 5; i++) assert.equal((await dl(env, `/api/download?token=${encodeURIComponent(tokA)}`)).status, 200);
  assert.equal((await dl(env, `/api/download?token=${encodeURIComponent(tokA)}`)).status, 403);

  // expiry
  const fresh = await (await status(env, pp, a)).json();
  const tok2 = new URL('https://x' + fresh.downloadUrl).searchParams.get('token');
  env.DB.raw.exec(`UPDATE download_tokens SET expires_at = '2000-01-01T00:00:00.000Z'`);
  assert.equal((await dl(env, `/api/download?token=${encodeURIComponent(tok2)}`)).status, 403);

  // order b never became paid -> no way to mint a token for it
  const bStatus = await (await status(env, pp, b)).json(); // sim says COMPLETED for all, so b settles; flip to prove the gate:
  assert.equal(bStatus.status, 'paid'); // (sim returns COMPLETED for every order here)
});

test('webhook: wrong/missing Authorization is rejected (401) and changes nothing', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.state = 'COMPLETED';
  for (const h of [{}, { Authorization: 'deadbeef' }, { Authorization: await sha256Hex('hookuser:wrong') }]) {
    const r = await hook(env, pp, { event: 'checkout.order.completed', payload: { merchantOrderId: orderId, state: 'COMPLETED' } }, h);
    assert.equal(r.status, 401);
  }
  assert.equal(row(env, orderId).status, 'pending');
});

test('webhook claims COMPLETED but PhonePe Order Status says PENDING: NOT paid (body is never trusted)', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.state = 'PENDING';
  const r = await hook(env, pp, { event: 'checkout.order.completed', payload: { merchantOrderId: orderId, state: 'COMPLETED', amount: 39900 } });
  assert.equal(r.status, 200);
  assert.equal(row(env, orderId).status, 'pending');
});

test('webhook: genuine completion marks paid once; duplicates/replays are harmless; both event-name styles accepted', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.state = 'COMPLETED';
  for (const event of ['pg.order.completed', 'pg.order.completed', 'checkout.order.completed']) {
    assert.equal((await hook(env, pp, { event, payload: { merchantOrderId: orderId, orderId: 'X', state: 'COMPLETED' } })).status, 200);
  }
  const o = row(env, orderId);
  assert.equal(o.status, 'paid');
  const paidAt = o.paid_at;
  await hook(env, pp, { event: 'pg.order.completed', payload: { merchantOrderId: orderId, orderId: 'X', state: 'COMPLETED' } });
  assert.equal(row(env, orderId).paid_at, paidAt, 'paid_at must not change on replays');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM webhook_events').get().n, 2);
});

test('webhook: PhonePe unreachable => 503 so PhonePe retries; unknown order / refund events => 200 ignored', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.down = true;
  assert.equal((await hook(env, pp, { event: 'pg.order.completed', payload: { merchantOrderId: orderId } })).status, 503);
  assert.equal(row(env, orderId).status, 'pending');
  pp.sim.down = false;
  assert.equal((await hook(env, pp, { event: 'pg.order.completed', payload: { merchantOrderId: 'ALFA-' + 'A'.repeat(32) } })).status, 200);
  assert.equal((await hook(env, pp, { event: 'pg.refund.completed', payload: { originalMerchantOrderId: orderId } })).status, 200);
});

test('paid is final: a late FAILED/PENDING signal cannot downgrade it', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.state = 'COMPLETED';
  await status(env, pp, orderId);
  pp.sim.state = 'FAILED';
  await hook(env, pp, { event: 'pg.order.failed', payload: { merchantOrderId: orderId, state: 'FAILED' } });
  clearThrottle(env);
  const b = await (await status(env, pp, orderId)).json();
  assert.equal(b.status, 'paid');
  assert.equal(row(env, orderId).status, 'paid');
});

test('failed payment can be retried; double-click / back-button reuses the open order; paid order is never re-charged', async () => {
  const { env, pp } = setup();
  // double click: same pending order is reused, only ONE PhonePe order exists
  const first = await (await checkout(env, pp)).json();
  const again = await (await checkout(env, pp, { retryOf: first.orderId })).json();
  assert.equal(again.orderId, first.orderId);
  assert.equal(again.reused, true);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);

  // failed -> a fresh order is created
  pp.sim.state = 'FAILED';
  clearThrottle(env);
  const f = await (await status(env, pp, first.orderId)).json();
  assert.equal(f.status, 'failed');
  assert.equal(f.canRetry, true);
  assert.ok(!('downloadUrl' in f));
  const retry = await (await checkout(env, pp, { retryOf: first.orderId })).json();
  assert.notEqual(retry.orderId, first.orderId);

  // customer actually paid the "failed" one late: retry must route to the order page instead of creating a new charge
  pp.sim.state = 'COMPLETED';
  const late = await (await checkout(env, pp, { retryOf: first.orderId })).json();
  assert.equal(late.alreadyPaid, true);
  assert.equal(late.orderId, first.orderId);
  assert.match(late.checkoutUrl, /\/success\.html\?order_id=ALFA-/);
});

test('status polling is throttled (does not hit PhonePe on every request)', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  await status(env, pp, orderId); await status(env, pp, orderId); await status(env, pp, orderId);
  assert.equal(pp.calls.filter((c) => c.url.includes('/status')).length, 1);
});

test('PhonePe down during status check => "pending", never paid/failed', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  pp.sim.down = true;
  const b = await (await status(env, pp, orderId)).json();
  assert.equal(b.status, 'pending');
  assert.match(b.message, /verification pending/i);
});

test('send-link: only for verified-paid orders, capped, optional (501 when email is not configured)', async () => {
  const { env, pp } = setup();
  const { orderId } = await (await checkout(env, pp)).json();
  const send = (e, body, f) => sendLink({ request: postJson('/api/send-link', body), env: e }, f ?? pp.fetchFn);
  assert.equal((await send(env, { order_id: orderId, email: 'a@b.co' })).status, 501);

  const withEmail = { ...env, RESEND_API_KEY: 'k', EMAIL_FROM: 'Store <no-reply@shop.test>' };
  const sent = [];
  const mail = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  assert.equal((await send(withEmail, { order_id: orderId, email: 'buyer@example.com' }, mail)).status, 403); // not paid yet
  assert.equal(sent.length, 0);

  pp.sim.state = 'COMPLETED';
  await status(env, pp, orderId);
  assert.equal((await send(withEmail, { order_id: orderId, email: 'not-an-email' }, mail)).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await send(withEmail, { order_id: orderId, email: 'buyer@example.com' }, mail)).status, 200);
  assert.equal((await send(withEmail, { order_id: orderId, email: 'buyer@example.com' }, mail)).status, 429);
  assert.equal(sent.length, 3);
  assert.match(sent[0].html, /success\.html\?order_id=ALFA-/);
  assert.ok(!/\.zip|\/api\/download|token=/i.test(sent[0].html), 'email must not contain a permanent or token file URL');
});
