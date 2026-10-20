/**
 * Static build for Cloudflare Pages (no dependencies, no bundler).
 *
 * The live storefront is plain HTML + ES modules (index.html, success.html, assets/js/*).
 * It must NOT be run through `vite build`, because Vite only builds index.html and
 * would drop success.html / cancel.html / policy pages and runtime-referenced images.
 *
 * Output: ./dist  (set "Build output directory" = dist in Cloudflare Pages)
 * Run:    npm run build
 *
 * Only an explicit allow-list is copied, so source code, docs, zips and secrets
 * can never end up on the public site.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Pages the storefront serves (every *.html in the project root).
const htmlPages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const REQUIRED = [
  'index.html', 'success.html', 'cancel.html', 'terms.html',
  'privacy.html', 'refund.html', '404.html',
  'assets/js/config.js', 'assets/js/main.js', 'assets/js/checkout.js', 'assets/js/success.js',
  'assets/css/styles.css', '_headers',
];

// Never publish these, even if they sneak into an allowed folder.
const BLOCKED_EXT = new Set(['.zip', '.map', '.env', '.sql', '.md', '.ts', '.tsx', '.pdf']);
const BLOCKED_NAMES = new Set(['.dev.vars', 'wrangler.toml', 'package.json', '.env']);
const SKIP_DIRS = new Set(['aistudio']); // public/assets/aistudio holds a 10MB source zip

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const filter = (src) => {
  const name = src.split('/').pop();
  if (statSync(src).isDirectory()) return !SKIP_DIRS.has(name);
  if (BLOCKED_NAMES.has(name) || name.startsWith('.env') || name.startsWith('.dev.vars')) return false;
  return !BLOCKED_EXT.has(extname(name).toLowerCase());
};

for (const page of htmlPages) cpSync(join(ROOT, page), join(DIST, page));
cpSync(join(ROOT, '_headers'), join(DIST, '_headers'));
cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true, filter });
// public/ is merged on top (same URLs, e.g. /assets/img/hero-bundle.png)
if (existsSync(join(ROOT, 'public'))) {
  cpSync(join(ROOT, 'public'), DIST, { recursive: true, filter });
}

const missing = REQUIRED.filter((f) => !existsSync(join(DIST, f)));
if (missing.length) {
  console.error('BUILD FAILED. Missing from dist:', missing.join(', '));
  process.exit(1);
}

let count = 0;
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      count++;
      if (!filter(p) && e.name !== '_headers') {
        console.error('BUILD FAILED. Blocked file in dist:', relative(DIST, p));
        process.exit(1);
      }
    }
  }
})(DIST);

console.log(`Static build OK -> dist/ (${htmlPages.length} pages, ${count} files)`);
