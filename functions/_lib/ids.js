// Unguessable order ids: ALFA-<32 uppercase hex> = 128 bits of randomness.
// Uppercase + [A-Z0-9-_] on purpose: matches sanitizeId() in assets/js/success.js
// and PhonePe's merchantOrderId rules (max 63 chars, only "_" and "-" as specials).
const ORDER_ID_RE = /^ALFA-[0-9A-F]{32}$/;

export function newOrderId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `ALFA-${hex}`;
}

export function isValidOrderId(value) {
  return typeof value === 'string' && ORDER_ID_RE.test(value);
}
