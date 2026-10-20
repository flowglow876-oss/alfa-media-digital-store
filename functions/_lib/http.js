// Small response helpers. Every API response is uncacheable.
const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extraHeaders } });
}

export function methodNotAllowed(allowed) {
  return json({ error: 'method_not_allowed' }, 405, { Allow: allowed });
}

/** Generic "backend not configured" answer. Never reveals which variables are missing to the browser. */
export function notConfigured(missing = []) {
  if (missing.length) console.error('Checkout not configured. Missing:', missing.join(', ')); // names only, never values
  return json({ error: 'not_configured', message: 'Checkout is not available yet. Please try again later.' }, 503);
}
