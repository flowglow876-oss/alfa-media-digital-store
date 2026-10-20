// GET /api/download?token=... — streams the bundle only for a PAID order and a valid, unexpired,
// signed token issued by /api/order-status. Prefer private R2 if configured; otherwise use a private KV value.
import { json, methodNotAllowed, notConfigured } from '../_lib/http.js';
import { verifyToken } from '../_lib/crypto.js';
import { isValidOrderId } from '../_lib/ids.js';
import { PRODUCT, ORDER_STATUS as S, MAX_DOWNLOADS_PER_LINK } from '../_lib/constants.js';

export async function handle({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  const hasR2 = typeof env.BUNDLE_BUCKET?.get === 'function';
  const hasKV = typeof env.BUNDLE_KV?.get === 'function';
  if (!env.DB || (!hasR2 && !hasKV) || !env.DOWNLOAD_SIGNING_SECRET) {
    return notConfigured([
      ...(!env.DB ? ['DB'] : []),
      ...(!hasR2 && !hasKV ? ['BUNDLE_BUCKET or BUNDLE_KV'] : []),
      ...(!env.DOWNLOAD_SIGNING_SECRET ? ['DOWNLOAD_SIGNING_SECRET'] : []),
    ]);
  }

  const denied = () => json({ error: 'link_invalid_or_expired', message: 'This download link is invalid or has expired. Open your order page to get a fresh one.' }, 403);

  const claims = await verifyToken(new URL(request.url).searchParams.get('token'), env.DOWNLOAD_SIGNING_SECRET);
  if (!claims || !isValidOrderId(claims.oid) || typeof claims.jti !== 'string' || !(claims.exp > Math.floor(Date.now() / 1000))) return denied();

  const row = await env.DB.prepare(
    `SELECT t.uses, t.expires_at, o.status FROM download_tokens t JOIN orders o ON o.order_id = t.order_id
     WHERE t.jti = ? AND t.order_id = ?`
  ).bind(claims.jti, claims.oid).first();
  if (!row || row.status !== S.PAID || Date.parse(row.expires_at) <= Date.now() || row.uses >= MAX_DOWNLOADS_PER_LINK) return denied();

  // If both bindings are configured, R2 is preferred. If the R2 object is missing, try KV as a fallback.
  let body = null;
  if (hasR2) {
    const object = await env.BUNDLE_BUCKET.get(PRODUCT.bundleObjectKey);
    if (object) body = object.body;
  }
  if (!body && hasKV) {
    // The Cloudflare-only deployment stores the compressed ZIP as base64 chunks because
    // the API upload channel only accepts text payloads. Legacy binary KV values still work.
    const stored = await env.BUNDLE_KV.get(PRODUCT.bundleObjectKey, 'text');
    if (typeof stored === 'string' && stored.startsWith('CHUNKED_BASE64:')) {
      const count = Number(stored.slice('CHUNKED_BASE64:'.length));
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        return json({ error: 'file_unavailable', message: 'The download bundle is not configured correctly.' }, 503);
      }
      const keys = Array.from({ length: count }, (_, i) => `${PRODUCT.bundleObjectKey}.part${String(i).padStart(3, '0')}`);
      const values = await env.BUNDLE_KV.get(keys);
      let base64 = '';
      for (const key of keys) {
        const part = values.get(key);
        if (typeof part !== 'string') return json({ error: 'file_unavailable', message: 'The download bundle is incomplete.' }, 503);
        base64 += part;
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      body = bytes;
    } else if (typeof stored === 'string' && stored.startsWith('BASE64:')) {
      const binary = atob(stored.slice('BASE64:'.length));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      body = bytes;
    } else {
      // Legacy binary KV value: ask KV for its binary stream rather than re-encoding text.
      body = await env.BUNDLE_KV.get(PRODUCT.bundleObjectKey, 'stream');
    }
  }
  if (!body) {
    console.error('Bundle object missing from configured storage:', PRODUCT.bundleObjectKey);
    return json({ error: 'file_unavailable', message: 'The file is temporarily unavailable. Please contact support with your order reference.' }, 503);
  }

  const bump = await env.DB.prepare('UPDATE download_tokens SET uses = uses + 1 WHERE jti = ? AND uses < ?').bind(claims.jti, MAX_DOWNLOADS_PER_LINK).run();
  if (!bump.meta || bump.meta.changes !== 1) return denied();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${PRODUCT.downloadFileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const onRequest = (ctx) => handle(ctx);
