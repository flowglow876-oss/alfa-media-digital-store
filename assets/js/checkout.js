/**
 * Alfa Media Digital Store - Secure Checkout Initiation
 * 
 * Complies with strict security rules:
 * - Never includes private payment gateway keys or secret tokens.
 * - If CHECKOUT_ENDPOINT is empty, shows clear in-page notice and DOES NOT fake payment.
 * - Handles double-clicks, network timeouts, and friendly error states.
 */

import { STORE_CONFIG } from './config.js';

let isCheckoutInProgress = false;

/**
 * Triggers the secure backend checkout creation flow
 */
export async function startCheckout(buttonElement = null, retryOverride = null) {
  if (isCheckoutInProgress) {
    return;
  }

  // 0. QR mode: show the payment QR card instead of calling the gateway backend
  if (STORE_CONFIG.PAYMENT_MODE === 'qr') {
    showQrCard();
    return;
  }

  // 1. Check if checkout endpoint is configured
  if (!STORE_CONFIG.CHECKOUT_ENDPOINT || STORE_CONFIG.CHECKOUT_ENDPOINT.trim() === '') {
    showCheckoutNotice(
      'Checkout is not connected yet',
      'The store owner has not connected a live backend checkout endpoint yet. To enable real payments, set CHECKOUT_ENDPOINT in assets/js/config.js to your Cloudflare Worker or server endpoint (e.g. https://api.yourdomain.com/create-checkout). See docs/BACKEND_CONTRACT.md for details.',
      'info'
    );
    return;
  }

  // 2. Set loading state & prevent double submissions
  isCheckoutInProgress = true;
  const originalText = buttonElement ? buttonElement.innerHTML : null;
  if (buttonElement) {
    buttonElement.setAttribute('disabled', 'true');
    buttonElement.classList.add('loading');
    buttonElement.style.opacity = '0.7';
    buttonElement.style.pointerEvents = 'none';
  }

  // Setup abort controller for timeout (12s)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    // Remember the last order so a retry / double-click reuses it instead of creating a duplicate (server decides).
    let retryOf = retryOverride;
    try { retryOf = retryOf || sessionStorage.getItem('alfa_last_order'); } catch { /* storage blocked */ }

    const payload = {
      retryOf,
      productId: STORE_CONFIG.PRODUCT_ID,
      productName: STORE_CONFIG.PRODUCT_NAME,
      amount: STORE_CONFIG.PRICE_INR,
      currency: 'INR',
      returnUrl: window.location.origin + '/success.html',
      cancelUrl: window.location.origin + '/cancel.html'
    };

    const response = await fetch(STORE_CONFIG.CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data && data.checkoutUrl) {
      try { if (data.orderId) sessionStorage.setItem('alfa_last_order', data.orderId); } catch { /* storage blocked */ }
      // Redirect safely to authentic payment gateway session (Razorpay, Stripe, Cashfree, etc.)
      window.location.href = data.checkoutUrl;
    } else {
      throw new Error('Invalid checkout session response: missing checkoutUrl');
    }
  } catch (err) {
    clearTimeout(timeoutId);
    let errorMessage = 'Unable to connect to the secure checkout service. Please verify your connection or try again shortly.';
    if (err.name === 'AbortError') {
      errorMessage = 'Checkout request timed out. Please check your internet connection and try again.';
    }
    showCheckoutNotice('Checkout Error', errorMessage, 'error');
  } finally {
    isCheckoutInProgress = false;
    if (buttonElement && originalText) {
      buttonElement.removeAttribute('disabled');
      buttonElement.classList.remove('loading');
      buttonElement.style.opacity = '1';
      buttonElement.style.pointerEvents = 'auto';
    }
  }
}

/**
 * UPI QR payment card (reuses the existing notice-modal styles; no redesign)
 */
function showQrCard() {
  const existing = document.getElementById('qr-pay-modal');
  if (existing) existing.remove();

  const price = STORE_CONFIG.PRICE_INR;
  const upi = STORE_CONFIG.UPI_ID
    ? `<p style="margin:0.25rem 0 0; font-size:0.85rem; color:#4B5563;">UPI ID: <strong>${escapeHtml(STORE_CONFIG.UPI_ID)}</strong></p>` : '';

  const modal = document.createElement('div');
  modal.id = 'qr-pay-modal';
  modal.className = 'notice-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'qr-title');
  modal.innerHTML = `
    <div class="notice-modal-card" style="max-width:380px; text-align:center; max-height:92vh; overflow-y:auto;">
      <div class="notice-header" style="justify-content:flex-end;">
        <button class="notice-close" aria-label="Close payment window">&times;</button>
      </div>
      <h3 id="qr-title" class="notice-title" style="margin-top:0;">Scan &amp; Pay ₹${price}</h3>
      <p class="notice-body" style="margin-bottom:0.75rem;">${escapeHtml(STORE_CONFIG.PRODUCT_NAME)}</p>
      <div style="background:#fff; border:2px solid #C8F169; border-radius:20px; padding:0.75rem; display:inline-block;">
        <img src="${escapeHtml(STORE_CONFIG.QR_IMAGE_URL)}" alt="UPI payment QR code" style="display:block; width:100%; max-width:260px; height:auto; border-radius:12px;">
      </div>
      <div style="margin-top:0.9rem; background:rgba(200,241,105,0.2); border-radius:14px; padding:0.7rem 0.9rem;">
        <p style="margin:0; font-weight:700; color:#0F3D1E;">Confirm this is ${escapeHtml(STORE_CONFIG.PAYEE_NAME)}</p>
        <p style="margin:0.2rem 0 0; font-size:0.8rem; color:#374151;">Check the name shows <strong>${escapeHtml(STORE_CONFIG.PAYEE_NAME)}</strong> in your UPI app before paying.</p>
        ${upi}
      </div>
      <p style="margin:0.9rem 0 0; font-size:0.8rem; color:#6B7280;">
        Amount: <strong>₹${price}</strong> · Pay with any UPI app (PhonePe, GPay, Paytm, BHIM)
      </p>
      <hr style="border:0; border-top:1px solid #E5E7EB; margin:1rem 0;">
      <p style="margin:0 0 0.5rem; font-weight:700; color:#0F3D1E;">After paying, upload your payment screenshot</p>
      <p style="margin:0 0 0.6rem; font-size:0.75rem; color:#6B7280;">Full screen showing amount, receiver name, date/time and the 12-digit UTR.</p>
      <label class="qr-drop" for="qr-proof-file">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <img id="qr-preview" alt="Selected payment screenshot" style="display:none;max-width:100%;max-height:170px;border-radius:12px;border:1px solid #E5E7EB;">
        <span id="qr-drop-text">Tap to choose screenshot</span>
        <input id="qr-proof-file" type="file" accept="image/png,image/jpeg,image/webp">
      </label>
      <button id="qr-verify-btn" class="qr-cta" disabled><span class="qr-cta-label">Verify Payment</span><span class="qr-cta-arrow">→</span></button>
      <p id="qr-msg" role="status" style="margin:0.6rem 0 0; font-size:0.85rem; min-height:1.2em;"></p>
      <p id="qr-order-ref" style="margin:0.2rem 0 0; font-size:0.7rem; color:#9CA3AF;"></p>
      <p style="margin:0.4rem 0 0; font-size:0.75rem; color:#6B7280;">
        Need help? <a href="mailto:${escapeHtml(STORE_CONFIG.SUPPORT_EMAIL)}" style="color:#1F5E2E; text-decoration:underline;">${escapeHtml(STORE_CONFIG.SUPPORT_EMAIL)}</a>
      </p>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  modal.querySelector('.notice-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', onKey);
  setupQrVerification(modal);
}

/** Opens/reuses a server-side order, then handles the screenshot upload + verification. */
async function setupQrVerification(modal) {
  const msg = modal.querySelector('#qr-msg');
  const btn = modal.querySelector('#qr-verify-btn');
  const fileInput = modal.querySelector('#qr-proof-file');
  const dropText = modal.querySelector('#qr-drop-text');
  const preview = modal.querySelector('#qr-preview');
  const say = (text, color = '#374151') => { msg.style.color = color; msg.textContent = text; };

  // 1) File selection works immediately (does not depend on the server): filename + thumbnail preview.
  let previewUrl = null;
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (!f) { preview.style.display = 'none'; dropText.textContent = 'Tap to choose screenshot'; btn.disabled = true; return; }
    previewUrl = URL.createObjectURL(f);
    preview.src = previewUrl; preview.style.display = 'block';
    dropText.textContent = '✓ ' + f.name + ' (tap to change)';
    btn.disabled = false;
    say('');
  });

  // 2) Open / reuse the server order in the background. If it failed, it is retried when the user taps Verify.
  let orderId = null;
  const openOrder = async () => {
    let retryOf = null;
    try { retryOf = sessionStorage.getItem('alfa_qr_order'); } catch { /* storage blocked */ }
    const res = await fetch(STORE_CONFIG.QR_ORDER_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retryOf })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) throw new Error('backend');
    if (res.status === 429) throw new Error('busy');
    if (!res.ok || !data.orderId) throw new Error('order');
    orderId = data.orderId;
    try { sessionStorage.setItem('alfa_qr_order', orderId); } catch { /* storage blocked */ }
    if (data.alreadyPaid) { window.location.href = '/success.html?order_id=' + encodeURIComponent(orderId); return; }
    modal.querySelector('#qr-order-ref').textContent = 'Order reference: ' + orderId;
  };
  const orderError = (e) => e.message === 'backend'
    ? 'Payment verification is not connected yet. Please contact support.'
    : e.message === 'busy' ? 'Too many requests right now. Please try again in a minute.'
    : 'Could not start your order. Check your internet and tap Verify Payment again.';
  try { await openOrder(); } catch (e) { say(orderError(e), '#B91C1C'); }

  btn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) { say('Please choose your payment screenshot first.', '#B91C1C'); return; }
    if (file.size > 4 * 1024 * 1024) { say('Image is too large (max 4 MB).', '#B91C1C'); return; }
    btn.disabled = true; say('');
    if (!orderId) {
      try { await openOrder(); } catch (e) { say(orderError(e), '#B91C1C'); btn.disabled = false; return; }
      if (!orderId) return;
    }
    const result = await runVerificationScreen(orderId, file);
    if (result.ok) return;               // download screen stays open
    say(result.message, '#B91C1C');
    btn.disabled = !fileInput.files.length;
  });
}

const VERIFY_STEPS = ['Uploading your screenshot', 'Reading payment details', 'Checking amount & receiver', 'Matching UTR & payment time', 'Final security check'];

/** Full-screen verification: animated steps while the server checks, then Approved (download) or Rejected (try again). */
function runVerificationScreen(orderId, file) {
  return new Promise((resolve) => {
    const scr = document.createElement('div');
    scr.id = 'qr-verify-screen';
    scr.setAttribute('role', 'alertdialog'); scr.setAttribute('aria-live', 'polite');
    scr.innerHTML = `<div class="vs-card">
      <div class="vs-orb"><div class="vs-ring"></div><div class="vs-ring r2"></div><div class="vs-core"></div></div>
      <h2 class="vs-title" id="vs-title">Verifying your payment…</h2>
      <p class="vs-line" id="vs-line">${VERIFY_STEPS[0]}…</p>
      <div class="vs-bar"><span id="vs-fill"></span></div>
      <div id="vs-actions"></div></div>`;
    document.body.appendChild(scr);
    const $ = (id) => scr.querySelector(id);
    let i = 0;
    const tick = setInterval(() => {
      i = Math.min(i + 1, VERIFY_STEPS.length - 1);
      $('#vs-line').textContent = VERIFY_STEPS[i] + '…';
      $('#vs-fill').style.width = ((i + 1) / (VERIFY_STEPS.length + 1) * 100) + '%';
    }, 1100);
    $('#vs-fill').style.width = '12%';

    const finish = (kind, title, line, buttons) => {
      clearInterval(tick);
      scr.classList.add(kind);
      $('#vs-fill').style.width = '100%';
      $('#vs-title').textContent = title;
      $('#vs-line').textContent = line;
      $('.vs-core').innerHTML = kind === 'ok'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
      const box = $('#vs-actions'); box.innerHTML = '';
      buttons.forEach(([label, cls, fn]) => { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.addEventListener('click', fn); box.appendChild(b); });
    };
    const close = () => scr.remove();

    (async () => {
      const started = Date.now();
      let data = {}, failed = false;
      try {
        const form = new FormData(); form.append('order_id', orderId); form.append('screenshot', file);
        const res = await fetch(STORE_CONFIG.SUBMIT_PROOF_ENDPOINT, { method: 'POST', body: form });
        data = await res.json().catch(() => ({}));
      } catch { failed = true; }
      const wait = 4200 - (Date.now() - started);          // let the user see the verification animation
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      if (!failed && data.status === 'paid') {
        let url = null;
        try {
          const r = await fetch(`${STORE_CONFIG.ORDER_STATUS_ENDPOINT}?order_id=${encodeURIComponent(orderId)}`, { headers: { Accept: 'application/json' } });
          const s = await r.json(); if (s.status === 'paid' && s.downloadUrl) url = s.downloadUrl;
        } catch { /* fall back to order page */ }
        const orderPage = '/success.html?order_id=' + encodeURIComponent(orderId);
        finish('ok', 'Payment Approved ✓', url ? 'Your 7 PDF guides are ready. Download starting…' : 'Payment confirmed. Open your order page to download.',
          url ? [['Download 7 PDFs', 'qr-cta vs-btn', () => { location.href = url; }], ['Open order page', 'vs-ghost', () => { location.href = orderPage; }]]
              : [['Open order page', 'qr-cta vs-btn', () => { location.href = orderPage; }]]);
        if (url) setTimeout(() => { location.href = url; }, 900);   // direct download (attachment, page stays open)
        resolve({ ok: true });
      } else {
        const msg = failed ? 'Network error. Please check your connection and try again.' : (data.message || 'Could not verify this screenshot.');
        finish('bad', 'Payment Not Verified', msg, [['Pay / Upload Again', 'qr-cta vs-btn', () => { close(); }]]);
        const retryBtn = $('#vs-actions button'); retryBtn.addEventListener('click', () => resolve({ ok: false, message: msg }));
      }
    })();
  });
}

/**
 * Accessible in-page notification modal
 */
function showCheckoutNotice(title, message, type = 'info') {
  // Remove any existing notice
  const existing = document.getElementById('checkout-notice-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'checkout-notice-modal';
  modal.className = 'notice-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'notice-title');

  const isError = type === 'error';
  const iconBg = isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(200, 241, 105, 0.15)';
  const iconColor = isError ? '#EF4444' : '#1F5E2E';

  modal.innerHTML = `
    <div class="notice-modal-card">
      <div class="notice-header">
        <div class="notice-icon" style="background:${iconBg}; color:${iconColor}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            ${isError ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>' : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'}
          </svg>
        </div>
        <button class="notice-close" aria-label="Close message">&times;</button>
      </div>
      <h3 id="notice-title" class="notice-title">${escapeHtml(title)}</h3>
      <p class="notice-body">${escapeHtml(message)}</p>
      <div class="notice-actions">
        <button class="btn btn-secondary notice-dismiss">Dismiss</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Focus trap & dismiss handlers
  const dismissBtn = modal.querySelector('.notice-dismiss');
  const closeBtn = modal.querySelector('.notice-close');

  const closeModal = () => {
    modal.classList.add('closing');
    setTimeout(() => modal.remove(), 200);
  };

  dismissBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // ESC key listener
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };
  document.addEventListener('keydown', handleKeyDown);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Bind to window for easy direct HTML accessibility if needed
window.startCheckout = startCheckout;
