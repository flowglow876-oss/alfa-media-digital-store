/**
 * Alfa Media Digital Store - Secure Order Verification
 * 
 * Strict Security Rules Enforced:
 * 1. NEVER unlocks downloads from client URL parameters (e.g., ?status=success is ignored).
 * 2. Only queries the authenticated backend GET ORDER_STATUS_ENDPOINT?order_id=...
 * 3. Never logs or stores download URLs in localStorage/sessionStorage.
 * 4. Downloads open strictly with rel="noopener noreferrer".
 */

import { STORE_CONFIG } from './config.js';
import { startCheckout } from './checkout.js';

let pollCount = 0;
const MAX_POLLS = 4;
const POLL_DELAYS = [3000, 5000, 8000, 10000];

export async function initOrderVerification() {
  const container = document.getElementById('order-status-root');
  if (!container) return;

  // Read only opaque order reference from URL
  const params = new URLSearchParams(window.location.search);
  const orderId = sanitizeId(params.get('order_id') || params.get('orderId') || params.get('ref'));

  if (!orderId) {
    renderNoOrderRef(container);
    return;
  }

  // Check if endpoint is configured
  if (!STORE_CONFIG.ORDER_STATUS_ENDPOINT || STORE_CONFIG.ORDER_STATUS_ENDPOINT.trim() === '') {
    renderEndpointNotConfigured(container, orderId);
    return;
  }

  // Fetch real order status
  await checkStatus(container, orderId);
}

async function checkStatus(container, orderId) {
  renderLoadingSkeleton(container, orderId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const url = new URL(STORE_CONFIG.ORDER_STATUS_ENDPOINT);
    url.searchParams.set('order_id', orderId);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 404) {
        renderNotFound(container, orderId);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    handleBackendResponse(container, orderId, data);
  } catch (err) {
    clearTimeout(timeout);
    renderError(container, orderId, err.message || 'Connection failure');
  }
}

function handleBackendResponse(container, orderId, data) {
  const status = (data.status || '').toLowerCase();

  if (status === 'paid' || status === 'verified' || status === 'completed') {
    // Verified payment: server must provide the ephemeral download link in response
    if (data.downloadUrl) {
      renderPaidVerified(container, orderId, data);
    } else {
      renderError(container, orderId, 'Verification confirmed, but secure download link was not generated. Please email support.');
    }
  } else if (status === 'pending' || status === 'processing') {
    // Pending: poll with backoff
    if (pollCount < MAX_POLLS) {
      const delay = POLL_DELAYS[pollCount] || 5000;
      pollCount++;
      renderPending(container, orderId, true, delay / 1000);
      setTimeout(() => checkStatus(container, orderId), delay);
    } else {
      renderPending(container, orderId, false);
    }
  } else {
    // Failed, cancelled, expired, or rejected
    renderFailed(container, orderId, data.message);
  }
}

function renderLoadingSkeleton(container, orderId) {
  container.innerHTML = `
    <div class="status-card loading-state">
      <div class="skeleton-spinner"></div>
      <h2 class="status-title">Verifying your payment with bank server…</h2>
      <p class="status-subtitle">Order Reference: <code>${escapeHtml(orderId)}</code></p>
      <div class="skeleton-lines">
        <div class="skeleton-line" style="width: 80%"></div>
        <div class="skeleton-line" style="width: 60%"></div>
      </div>
      <p class="text-muted" style="font-size: 0.85rem; margin-top: 1.5rem;">
        Downloads unlock only after your payment is verified.
      </p>
    </div>
  `;
}

function renderEmailForm(data) {
  if (!data.emailAvailable || !STORE_CONFIG.SEND_LINK_ENDPOINT) return '';
  if (data.emailSent) return '<p class="text-muted" style="font-size:0.8rem; margin-top:0.5rem;">A link to this page has already been emailed to you.</p>';
  return `
    <form id="email-link-form" style="margin-top:0.75rem; display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
      <input id="email-link-input" type="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address" style="padding:0.6rem 0.8rem; border:1px solid #D1D5DB; border-radius:999px; min-width:220px;">
      <button type="submit" class="btn btn-secondary" style="font-size:0.85rem;">Email me the link</button>
      <span id="email-link-msg" class="text-muted" role="status" style="font-size:0.8rem; width:100%;"></span>
    </form>`;
}

function bindEmailForm(container, orderId) {
  const form = container.querySelector('#email-link-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = container.querySelector('#email-link-msg');
    const email = container.querySelector('#email-link-input').value.trim();
    msg.textContent = 'Sending…';
    try {
      const res = await fetch(STORE_CONFIG.SEND_LINK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, email })
      });
      msg.textContent = res.ok ? 'Sent! Check your inbox (and spam folder).' : 'Could not send the email. Your download button above still works.';
    } catch {
      msg.textContent = 'Could not send the email. Your download button above still works.';
    }
  });
}

function renderPaidVerified(container, orderId, data) {
  try { sessionStorage.removeItem('alfa_last_order'); } catch { /* storage blocked */ }
  const expiresMsg = data.expiresIn ? `Link valid for ${escapeHtml(data.expiresIn)}.` : 'Download link is time-limited for security.';
  
  container.innerHTML = `
    <div class="status-card success-state">
      <div class="status-icon success-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0F3D1E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>

      <div class="pill-badge" style="background:#C8F169; color:#0F3D1E; font-weight:700;">
        PAYMENT VERIFIED
      </div>

      <h1 class="status-title" style="margin-top:0.75rem;">Payment Successful – Download Your Bundle</h1>
      <p class="status-subtitle">
        Order <strong>${escapeHtml(orderId)}</strong> has been verified. You now have access to the complete 7-Guide PDF Blueprint Bundle.
      </p>

      <div class="download-box">
        <div class="download-info">
          <span class="file-name">Online-Business-Blueprint-Bundle-7-Guides.zip</span>
          <span class="file-meta">7 PDF Guides in one ZIP file</span>
        </div>
        <a id="secure-download-btn" href="${escapeHtml(data.downloadUrl)}" rel="noopener noreferrer" class="btn btn-primary btn-large download-action">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download All 7 PDF Guides</span>
        </a>
      </div>

      <div class="status-details">
        <p class="text-muted" style="font-size:0.85rem; margin-bottom:0.5rem;">
          ${expiresMsg} Reopen this page any time to get a fresh link.
        </p>
        ${renderEmailForm(data)}
        <p class="text-muted" style="font-size:0.8rem;">
          Need assistance? Contact our team at <a href="mailto:${STORE_CONFIG.SUPPORT_EMAIL}">${STORE_CONFIG.SUPPORT_EMAIL}</a> or WhatsApp ${STORE_CONFIG.WHATSAPP_DISPLAY}.
        </p>
      </div>

      <div style="margin-top:2rem;">
        <a href="/" class="text-link">&larr; Return to Alfa Media Storefront</a>
      </div>
    </div>
  `;
  bindEmailForm(container, orderId);
}

function renderPending(container, orderId, isPolling, secondsLeft = 0) {
  container.innerHTML = `
    <div class="status-card pending-state">
      <div class="status-icon pending-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      </div>

      <div class="pill-badge" style="background:rgba(217, 119, 6, 0.15); color:#D97706; font-weight:700;">
        SETTLEMENT IN PROGRESS
      </div>

      <h2 class="status-title" style="margin-top:0.75rem;">Payment verification pending</h2>
      <p class="status-subtitle">
        We are still confirming your payment for Order <code>${escapeHtml(orderId)}</code>. This usually takes a few seconds.
      </p>

      ${isPolling ? `
        <p class="text-muted" style="font-size:0.9rem; margin:1rem 0;">
          Checking automatically in ${secondsLeft}s... (Attempt ${pollCount} of ${MAX_POLLS})
        </p>
      ` : `
        <div class="notice-box" style="margin: 1.5rem 0; text-align:left;">
          <p><strong>Did your bank deduct ₹399?</strong></p>
          <p style="font-size:0.85rem; color:#4B5563; margin-top:0.25rem;">
            If your funds were debited, your order is safe. Use the button below to check again, or reopen this page later with the same order reference.
          </p>
        </div>
        <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;">
          <button id="recheck-status-btn" class="btn btn-primary" style="font-size:0.9rem;">
            Check payment status
          </button>
          <a href="mailto:${STORE_CONFIG.SUPPORT_EMAIL}?subject=Payment%20Pending%20Order%20${encodeURIComponent(orderId)}" class="btn btn-secondary" style="font-size:0.9rem;">
            Contact Support
          </a>
        </div>
      `}

      <div style="margin-top:2rem;">
        <a href="/" class="text-link">&larr; Return to Storefront</a>
      </div>
    </div>
  `;
  const recheck = container.querySelector('#recheck-status-btn');
  if (recheck) recheck.addEventListener('click', () => { pollCount = 0; checkStatus(container, orderId); });
}

function renderNotFound(container, orderId) {
  container.innerHTML = `
    <div class="status-card failed-state">
      <div class="status-icon failed-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>

      <div class="pill-badge" style="background:rgba(220, 38, 38, 0.15); color:#DC2626; font-weight:700;">
        ORDER NOT FOUND
      </div>

      <h2 class="status-title" style="margin-top:0.75rem;">No Record Found for This Reference</h2>
      <p class="status-subtitle">
        We could not find a confirmed payment record for Order Reference <code>${escapeHtml(orderId)}</code>.
      </p>

      <p class="text-muted" style="font-size:0.85rem; margin:1rem 0;">
        Downloads remain strictly locked without an authenticated server verification. If you completed a payment, please check your receipt or contact us.
      </p>

      <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; margin-top:1.5rem;">
        <a href="/" class="btn btn-primary">Start New Checkout – ₹${STORE_CONFIG.PRICE_INR}</a>
        <a href="mailto:${STORE_CONFIG.SUPPORT_EMAIL}?subject=Order%20Lookup%20Inquiry%20${encodeURIComponent(orderId)}" class="btn btn-secondary">
          Email Support
        </a>
      </div>
    </div>
  `;
}

function renderFailed(container, orderId, message) {
  container.innerHTML = `
    <div class="status-card failed-state">
      <div class="status-icon failed-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <div class="pill-badge" style="background:rgba(220, 38, 38, 0.15); color:#DC2626; font-weight:700;">
        UNVERIFIED
      </div>

      <h2 class="status-title" style="margin-top:0.75rem;">Payment Verification Failed</h2>
      <p class="status-subtitle">
        ${escapeHtml(message || 'The transaction could not be confirmed by the payment gateway.')}
      </p>

      <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; margin-top:1.5rem;">
        <button id="retry-payment-btn" class="btn btn-primary">Try Again</button>
        <a href="mailto:${STORE_CONFIG.SUPPORT_EMAIL}" class="btn btn-secondary">Contact Support</a>
      </div>
    </div>
  `;
  // Server decides whether to reuse this order or open a fresh one (no accidental duplicate orders).
  const retryBtn = container.querySelector('#retry-payment-btn');
  if (retryBtn) retryBtn.addEventListener('click', () => startCheckout(retryBtn, orderId));
}

function renderNoOrderRef(container) {
  container.innerHTML = `
    <div class="status-card">
      <h2 class="status-title">Order Reference Required</h2>
      <p class="status-subtitle">
        This verification page requires a valid order reference (e.g. <code>?order_id=ORD-12345</code>). Downloads are never unlocked based on static page visits.
      </p>
      <div style="margin-top:1.5rem;">
        <a href="/" class="btn btn-primary">Go to Storefront</a>
      </div>
    </div>
  `;
}

function renderEndpointNotConfigured(container, orderId) {
  container.innerHTML = `
    <div class="status-card">
      <div class="pill-badge" style="background:rgba(217, 119, 6, 0.15); color:#D97706; font-weight:700;">
        BACKEND NOT CONNECTED
      </div>
      <h2 class="status-title" style="margin-top:0.75rem;">Backend Endpoint Pending</h2>
      <p class="status-subtitle">
        You are looking up Order <code>${escapeHtml(orderId)}</code>, but <code>ORDER_STATUS_ENDPOINT</code> is currently empty in <code>assets/js/config.js</code>.
      </p>
      <div class="notice-box" style="margin: 1.5rem 0; text-align:left;">
        <p><strong>To connect your live verification backend:</strong></p>
        <ol style="margin-top:0.5rem; padding-left:1.25rem; font-size:0.85rem; color:#4B5563; line-height:1.6;">
          <li>Deploy your Cloudflare Worker or backend API endpoint (see <code>docs/BACKEND_CONTRACT.md</code>).</li>
          <li>Set <code>ORDER_STATUS_ENDPOINT</code> in <code>assets/js/config.js</code>.</li>
          <li>The frontend will then securely query your server and display the signed, expiring download link only after verified bank payment.</li>
        </ol>
      </div>
      <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;">
        <a href="/" class="btn btn-secondary">Return to Storefront</a>
        <button onclick="window.history.back()" class="btn btn-primary">Go Back</button>
      </div>
    </div>
  `;
}

function sanitizeId(str) {
  if (!str) return '';
  return str.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, '').slice(0, 40);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
