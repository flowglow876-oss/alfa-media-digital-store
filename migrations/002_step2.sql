-- Only for databases created with the step-1 schema. Run ONCE:
--   npx wrangler d1 execute alfa-store-db --remote --file=migrations/002_step2.sql
-- (Fresh databases should use schema.sql instead.)
ALTER TABLE orders ADD COLUMN redirect_url TEXT;
ALTER TABLE orders ADD COLUMN expires_at TEXT;
ALTER TABLE orders ADD COLUMN last_checked_at TEXT;
ALTER TABLE orders ADD COLUMN email TEXT;
ALTER TABLE orders ADD COLUMN email_sent_count INTEGER NOT NULL DEFAULT 0;
-- SQLite cannot alter a CHECK constraint: to allow status='review' on an old DB, recreate the table
-- (or simply create a fresh D1 database from schema.sql — nothing is live yet).
