import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal D1 look-alike backed by node:sqlite, loaded with the real schema.sql. */
export function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));
  return {
    raw: db,
    prepare(sql) {
      const st = db.prepare(sql);
      return {
        bind(...args) {
          return {
            first: async () => st.get(...args) ?? null,
            all: async () => ({ results: st.all(...args) }),
            run: async () => { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; },
          };
        },
      };
    },
  };
}

export const TEST_ENV = () => ({
  PHONEPE_ENV: 'sandbox',
  PHONEPE_CLIENT_ID: 'test-client',
  PHONEPE_CLIENT_SECRET: 'test-secret-value',
  PHONEPE_CLIENT_VERSION: '1',
  PHONEPE_WEBHOOK_USERNAME: 'hookuser',
  PHONEPE_WEBHOOK_PASSWORD: 'hookpass',
  DOWNLOAD_SIGNING_SECRET: 'unit-test-signing-secret',
  SITE_URL: 'https://shop.test',
  DB: makeDb(),
  BUNDLE_BUCKET: { get: async () => ({ body: new Blob(['PK-fake-zip-bytes']).stream() }) },
});

/** Stubbed PhonePe: records calls, lets a test choose the Order Status answer. Never touches the network. */
export function makePhonePe() {
  const calls = [];
  const sim = { state: 'PENDING', amountOverride: null, down: false, orderIds: {} };
  const fetchFn = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const ok = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/v1/oauth/token')) return ok({ access_token: 'tok123', token_type: 'O-Bearer', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    if (u.endsWith('/checkout/v2/pay')) {
      const b = JSON.parse(init.body);
      sim.orderIds[b.merchantOrderId] = 'OMO' + b.merchantOrderId.slice(-6);
      return ok({ orderId: sim.orderIds[b.merchantOrderId], state: 'PENDING', redirectUrl: `https://mercury-uat.phonepe.test/pay?m=${b.merchantOrderId}` });
    }
    if (u.includes('/checkout/v2/order/')) {
      if (sim.down) return ok({ code: 'INTERNAL' }, 500);
      const mid = decodeURIComponent(u.split('/order/')[1].split('/status')[0]);
      return ok({ orderId: sim.orderIds[mid], state: sim.state, amount: sim.amountOverride ?? 39900, paymentDetails: [] });
    }
    throw new Error('unexpected fetch ' + u);
  };
  return { fetchFn, calls, sim };
}

export const req = (url, init) => new Request('https://shop.test' + url, init);
export const postJson = (url, body, headers = {}) => req(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
export const clearThrottle = (env) => env.DB.raw.exec('UPDATE orders SET last_checked_at = NULL');
