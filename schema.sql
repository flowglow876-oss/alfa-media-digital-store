-- Cloudflare D1 (SQLite). Apply with:
--   npx wrangler d1 execute alfa-store-db --remote --file=schema.sql
-- Safe to re-run on a fresh database (IF NOT EXISTS).
-- NOTE: if you already applied the step-1 schema, run migrations/002_step2.sql instead (adds new columns).

CREATE TABLE IF NOT EXISTS orders (
  order_id          TEXT PRIMARY KEY,                 -- ALFA-<32 hex>, also PhonePe merchantOrderId
  product_id        TEXT NOT NULL,
  amount_paise      INTEGER NOT NULL CHECK (amount_paise > 0),
  currency          TEXT NOT NULL DEFAULT 'INR',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','review')),
  phonepe_order_id  TEXT,                             -- PhonePe's own orderId from Create Payment
  phonepe_state     TEXT,                             -- last verified PENDING|COMPLETED|FAILED (or note)
  redirect_url      TEXT,                             -- PhonePe hosted checkout URL (reused for double-click/back-button)
  expires_at        TEXT,                             -- when the PhonePe order stops accepting payment
  last_checked_at   TEXT,                             -- last server-side PhonePe status call (throttle)
  payment_method    TEXT NOT NULL DEFAULT 'phonepe' CHECK (payment_method IN ('phonepe','qr')),
  proof_attempts    INTEGER NOT NULL DEFAULT 0,
  email             TEXT,                             -- optional: set when customer asks for an emailed link
  email_sent_count  INTEGER NOT NULL DEFAULT 0,
  environment       TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  paid_at           TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Webhook de-duplication: same notification delivered twice is processed once.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_key    TEXT PRIMARY KEY,                      -- sha256(event|merchantOrderId|state|orderId)
  order_id     TEXT,
  event_type   TEXT NOT NULL,
  state        TEXT,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Short-lived download links (HMAC-signed). One row per issued link.
CREATE TABLE IF NOT EXISTS download_tokens (
  jti          TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(order_id),
  expires_at   TEXT NOT NULL,
  uses         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tokens_order ON download_tokens(order_id);

-- QR mode: every screenshot ever submitted. sha256 and UTR are UNIQUE => a screenshot or a UTR can pay for ONE order only.
CREATE TABLE IF NOT EXISTS payment_proofs (
  sha256      TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(order_id),
  utr         TEXT UNIQUE,
  result      TEXT NOT NULL CHECK (result IN ('accepted','rejected')),
  reason      TEXT,
  extracted   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_proofs_order ON payment_proofs(order_id);
