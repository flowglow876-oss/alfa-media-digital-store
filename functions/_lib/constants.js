// Single source of truth for the product. The browser NEVER decides price.
export const PRODUCT = Object.freeze({
  id: 'online-business-blueprint-7',
  name: 'Online Business Blueprint Bundle – 7 PDF Guides',
  amountPaise: 39900, // ₹399.00 fixed (PhonePe amounts are in paise)
  currency: 'INR',
  // Key of the single ZIP (7 PDFs) in private R2 (BUNDLE_BUCKET) or KV (BUNDLE_KV)
  bundleObjectKey: 'bundles/online-business-blueprint-7-guides.zip',
  downloadFileName: 'Online-Business-Blueprint-Bundle-7-Guides.zip',
});

export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REVIEW: 'review', // PhonePe says COMPLETED but amount/ids did not match -> never delivered, needs a human
});

export const DOWNLOAD_LINK_TTL_SECONDS = 600; // 10 minutes
export const MAX_DOWNLOADS_PER_LINK = 5;      // resume/retry within the 10 minutes
export const MAX_LINKS_PER_ORDER = 20;        // cap on re-issued links per order
export const PHONEPE_ORDER_EXPIRE_SECONDS = 1200; // customer has 20 min to finish paying
export const STATUS_CHECK_MIN_INTERVAL_MS = 4000; // don't hammer PhonePe when the page polls
export const MAX_EMAILS_PER_ORDER = 3;

// QR / screenshot mode
export const QR_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const QR_MAX_ATTEMPTS_PER_ORDER = 5;
export const QR_ORDER_REUSE_MINUTES = 60;
export const QR_PAID_BEFORE_ORDER_GRACE_MS = 3 * 60_000;  // screenshot time may be at most 3 min before the order was opened
export const QR_PAID_AFTER_NOW_GRACE_MS = 5 * 60_000;     // and at most 5 min in the future (clock drift)
export const QR_MIN_CONFIDENCE = 0.7;
export const QR_PAID_AT_TOLERANCE_MS = 2 * 60_000; // the two independent AI reads must agree on the payment time within 2 minutes
export const QR_VISION_TIMEOUT_MS = 9000;    // whole check must finish well inside ~10 seconds
export const QR_MIN_IMAGE_WIDTH = 300;
export const QR_MIN_ASPECT = 1.25;            // phone screenshots are tall (height/width); squares/landscape = not a phone screenshot
export const QR_GLOBAL_ORDERS_PER_MIN = 30;  // abuse guard: max new QR orders opened per minute (all visitors)
export const QR_GLOBAL_CHECKS_PER_MIN = 40;  // abuse guard: max paid vision checks per minute (cost cap)
