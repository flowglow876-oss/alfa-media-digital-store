// Small WebCrypto helpers (work in Cloudflare Workers and Node 20+).
const enc = new TextEncoder();

export const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function sha256BytesHex(bytes) {
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

/** Constant-time string comparison (length is not secret here: both are fixed-length hex). */
export function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}

/** token = base64url(payloadJson) + "." + base64url(HMAC-SHA256(payloadB64)) */
export async function signToken(payload, secret) {
  const body = b64u.enc(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), enc.encode(body));
  return `${body}.${b64u.enc(sig)}`;
}

/** Returns the payload object, or null when malformed / bad signature. Does NOT check expiry. */
export async function verifyToken(token, secret) {
  try {
    if (typeof token !== 'string' || token.length > 600) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), b64u.dec(sig), enc.encode(body));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(b64u.dec(body)));
  } catch {
    return null;
  }
}

export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}
