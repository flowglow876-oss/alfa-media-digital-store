import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT } from '../functions/_lib/constants.js';
import { newOrderId, isValidOrderId } from '../functions/_lib/ids.js';
import { loadPhonePeConfig, REQUIRED_ENV } from '../functions/_lib/phonepe-config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);

test('build: all pages + runtime assets land in dist, nothing sensitive', () => {
  execFileSync('node', ['scripts/build-static.mjs'], { cwd: ROOT, stdio: 'pipe' });
  for (const f of ['index.html','success.html','cancel.html','terms.html','privacy.html','refund.html','404.html',
    '_headers','assets/js/config.js','assets/css/styles.css','assets/img/guide-02-digital-products.jpg',
    'assets/img/covers/guide-07-influencer-marketing.jpg']) {
    assert.ok(existsSync(join(ROOT, 'dist', f)), `missing dist/${f}`);
  }
  const files = walk(join(ROOT, 'dist'));
  assert.equal(files.filter((f) => /\.(zip|sql|md|ts|tsx|pdf|map)$/i.test(f)).length, 0);
  assert.equal(files.filter((f) => /aistudio|\.env|\.dev\.vars|wrangler|package\.json/i.test(f)).length, 0);
  assert.ok(files.every((f) => statSync(f).size < 25 * 1024 * 1024), 'Pages max file size is 25MB');
});

test('every local /assets reference in HTML and config.js exists in dist', () => {
  const dist = (p) => existsSync(join(ROOT, 'dist', p.replace(/^\//, '')));
  const refs = new Set();
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.html')).concat(['assets/js/config.js','assets/js/main.js'])) {
    for (const m of read(f).matchAll(/["'(](\/assets\/[A-Za-z0-9_\-./]+\.[a-z0-9]+)["')]/g)) refs.add(m[1]);
  }
  const missing = [...refs].filter((r) => !dist(r));
  assert.deepEqual(missing, []);
  assert.ok(refs.size > 10);
});

test('DEMO payment simulation is gone from frontend', () => {
  for (const f of ['assets/js/success.js', 'assets/js/checkout.js', 'index.html', 'success.html', 'cancel.html']) {
    assert.doesNotMatch(read(f), /DEMO|renderDemoHarness|sample-blueprint-bundle|test-paid/i, f);
  }
});

test('frontend contract preserved: CHECKOUT_ENDPOINT -> {checkoutUrl}, ORDER_STATUS_ENDPOINT -> {status, downloadUrl}', () => {
  const c = read('assets/js/checkout.js'), s = read('assets/js/success.js');
  assert.match(c, /data\.checkoutUrl/);
  assert.match(s, /data\.downloadUrl/);
  assert.match(s, /order_id/);
  assert.match(read('assets/js/config.js'), /CHECKOUT_ENDPOINT: '\/api\/create-checkout'/); // same-origin Pages Function
});

test('product is fixed at ₹399 (39900 paise) server-side', () => {
  assert.equal(PRODUCT.amountPaise, 39900);
  assert.equal(PRODUCT.currency, 'INR');
  assert.equal(399, Number(read('assets/js/config.js').match(/PRICE_INR:\s*(\d+)/)[1]));
});

test('order ids: unguessable, valid for PhonePe + sanitizeId', () => {
  const ids = new Set(Array.from({ length: 2000 }, newOrderId));
  assert.equal(ids.size, 2000);
  for (const id of ids) {
    assert.ok(isValidOrderId(id));
    assert.ok(id.length <= 40, 'success.js sanitizeId cuts at 40 chars');
    assert.equal(id, id.toUpperCase().replace(/[^A-Z0-9\-_]/g, ''));
  }
  for (const bad of ['', 'ALFA-123', 'alfa-' + 'a'.repeat(32), 'ALFA-' + 'G'.repeat(32), "ALFA-' OR 1=1--", null, undefined, 42, 'LOOKUP'])
    assert.equal(isValidOrderId(bad), false, String(bad));
});

test('phonepe config: fails closed without env, never echoes secrets, official URLs', () => {
  const none = loadPhonePeConfig({});
  assert.equal(none.ok, false);
  assert.deepEqual(none.missing, REQUIRED_ENV);
  const env = Object.fromEntries(REQUIRED_ENV.map((k) => [k, 'x']));
  assert.equal(loadPhonePeConfig({ ...env, PHONEPE_ENV: 'live' }).ok, false);
  const sb = loadPhonePeConfig({ ...env, PHONEPE_ENV: 'sandbox', SITE_URL: 'https://a.in/' });
  assert.equal(sb.ok, true);
  assert.equal(sb.config.siteUrl, 'https://a.in');
  assert.equal(sb.config.urls.pay, 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay');
  assert.equal(sb.config.urls.token, 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token');
  assert.equal(sb.config.urls.status('ALFA-1'), 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/ALFA-1/status');
  const pr = loadPhonePeConfig({ ...env, PHONEPE_ENV: 'production' });
  assert.equal(pr.config.urls.pay, 'https://api.phonepe.com/apis/pg/checkout/v2/pay');
  assert.equal(pr.config.urls.token, 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token');
  assert.equal(pr.config.urls.status('X'), 'https://api.phonepe.com/apis/pg/checkout/v2/order/X/status');
});

test('no secrets in repo files: .gitignore covers env files, example has placeholders only', () => {
  const g = read('.gitignore');
  assert.match(g, /\.dev\.vars\*/); assert.match(g, /\.env\*/);
  const ex = read('.dev.vars.example');
  assert.match(ex, /YOUR_SANDBOX_CLIENT_SECRET/);
  assert.ok(!existsSync(join(ROOT, 'wrangler.toml')), 'real wrangler.toml would override dashboard bindings');
  for (const f of walk(join(ROOT, 'assets')).concat(walk(join(ROOT, 'functions')))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /client_secret\s*[:=]\s*['"][A-Za-z0-9]{12,}/i, f);
  }
});
