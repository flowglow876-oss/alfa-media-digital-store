// Optional email delivery through Resend's REST API (https://resend.com). Fully configurable:
// set RESEND_API_KEY + EMAIL_FROM to enable; leave unset and email is simply skipped.
// Swap providers by editing sendEmail() only.
export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendDeliveryEmail(env, { to, orderId, siteUrl, productName }, fetchFn = fetch) {
  // The link points at the order page, which re-verifies payment and mints a fresh 10-minute download link.
  // No permanent file URL is ever put in an email.
  const link = `${siteUrl}/success.html?order_id=${encodeURIComponent(orderId)}`;
  const html = `<p>Thank you for your purchase of <strong>${esc(productName)}</strong>.</p>
<p><a href="${esc(link)}">Open your order page to download your bundle</a></p>
<p>Order reference: <code>${esc(orderId)}</code></p>
<p>For security, the download button on that page creates a fresh short-lived link each time you open it. Keep this email private.</p>`;
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: `Your download – ${productName}`, html }),
  });
  if (!res.ok) throw new Error(`email provider HTTP ${res.status}`);
  return true;
}

export const isPlausibleEmail = (v) =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(v);
