> **Superseded:** the implemented API (PhonePe, Cloudflare Pages Functions) is described in `docs/PHONEPE_SETUP.md`. The generic Razorpay/Stripe examples below are historical.

# Backend API Contract & Integration Guide

This document defines the backend API requirements for **Alfa Media Digital Store**. The frontend is built strictly as a client-side static application with zero secrets in its source code. To process live payments and unlock verified downloads, deploy a lightweight serverless backend (e.g. Cloudflare Worker, Express server, or AWS Lambda) implementing the contracts below.

---

## Architecture Overview

```
[Customer Browser]
       │
       ▼ (1) Click "Buy Now – ₹399"
  POST CHECKOUT_ENDPOINT { productId, returnUrl, cancelUrl }
       │
       ▼
[Your Backend / Cloudflare Worker]
       │
       ▼ (2) Create session using Gateway Secret Key (e.g. Razorpay / Stripe)
[Payment Gateway Session]
       │
       ▼ (3) Redirect browser to gateway payment page
[Customer Completes UPI / Card Payment]
       │
       ▼ (4) Gateway notifies your backend via secure webhook
[Backend Validates Webhook Signature & Logs Order as PAID]
       │
       ▼ (5) Customer is redirected to /success.html?order_id=ORD-12345
  GET ORDER_STATUS_ENDPOINT?order_id=ORD-12345
       │
       ▼ (6) Backend validates order status; returns short-lived download link
[Download Button Unlocks in Browser]
```

---

## 1. POST Create Checkout Session

**Endpoint:** Configured as `CHECKOUT_ENDPOINT` in `assets/js/config.js` (e.g. `https://api.yourdomain.com/create-checkout`)

### Request Headers
```http
POST /create-checkout HTTP/1.1
Host: api.yourdomain.com
Content-Type: application/json
Accept: application/json
```

### Request Payload
```json
{
  "productId": "online-business-blueprint-7",
  "productName": "Online Business Blueprint Bundle – 7 PDF Guides",
  "amount": 399,
  "currency": "INR",
  "returnUrl": "https://alfamedia.store/success.html",
  "cancelUrl": "https://alfamedia.store/cancel.html"
}
```

### Response Expected by Frontend
Status: `200 OK`
```json
{
  "orderId": "ORD-849201",
  "checkoutUrl": "https://checkout.razorpay.com/v1/checkout/session_xyz123"
}
```

### Error Response
Status: `400 Bad Request` or `500 Internal Server Error`
```json
{
  "error": "Unable to initiate payment session. Please try again."
}
```

---

## 2. Gateway Webhook Handler (Server-Side Only)

When the customer finishes payment at their bank/UPI app:
1. The payment gateway dispatches a `POST` request with a cryptographic signature header (e.g., `X-Razorpay-Signature` or `Stripe-Signature`).
2. Your backend MUST calculate the expected HMAC using your secret webhook key:
   ```javascript
   const crypto = require('crypto');
   const expectedSignature = crypto
     .createHmac('sha256', process.env.WEBHOOK_SECRET)
     .update(rawBody)
     .digest('hex');
   
   if (expectedSignature !== req.headers['x-razorpay-signature']) {
     return res.status(400).send('Invalid signature');
   }
   ```
3. Mark the order ID status as `paid` in your database (e.g., Cloudflare D1, KV, Supabase, or PostgreSQL).

---

## 3. GET Order Status & Ephemeral Download Link

**Endpoint:** Configured as `ORDER_STATUS_ENDPOINT` in `assets/js/config.js` (e.g. `https://api.yourdomain.com/order-status`)

### Request
```http
GET /order-status?order_id=ORD-849201 HTTP/1.1
Host: api.yourdomain.com
Accept: application/json
```

### Response: When Payment is Verified (`status: "paid"`)
Status: `200 OK`
```json
{
  "status": "paid",
  "orderId": "ORD-849201",
  "downloadUrl": "https://vault.alfamedia.store/secure-bundles/blueprint-7.zip?token=exp_1700000000_sig_abc123",
  "expiresIn": "24 hours"
}
```

> **Security Rule:** The `downloadUrl` MUST be a short-lived, pre-signed URL (e.g., AWS S3 presigned URL or Cloudflare R2 presigned link) that expires after 12 to 24 hours. Never return a public or permanent file URL.

### Response: When Webhook is Still Pending (`status: "pending"`)
Status: `200 OK`
```json
{
  "status": "pending",
  "orderId": "ORD-849201",
  "message": "Payment confirmation in progress with the bank."
}
```

### Response: When Order Reference is Invalid or Failed (`status: "failed"` or 404)
Status: `404 Not Found` or `200 OK`
```json
{
  "status": "failed",
  "orderId": "ORD-849201",
  "message": "No confirmed payment record found for this order ID."
}
```

---

## 4. Security Checklist Before Launch

- [ ] Private payment gateway keys (e.g., `rzp_live_secret_...`) are stored in server environment variables only.
- [ ] No secret keys appear anywhere in `assets/js/config.js` or client code.
- [ ] Webhook signature verification is strictly enabled on the server.
- [ ] Pre-signed download URLs generated from Cloudflare R2 / AWS S3 expire within 24 hours.
- [ ] Rate limiting is enforced on `/create-checkout` and `/order-status` to prevent bot enumeration.
