// First Load JS per route, read from a finished `next build`.
//
// Next 16's build output no longer prints route sizes, so this reads each
// prerendered page's HTML, collects the /_next/static/chunks/*.js it loads up
// front, and sums their raw and gzipped sizes. Dynamic routes (no HTML at build
// time) are listed as such. Prints a markdown table, plus totals, as JSON with --json.
//
//   node scripts/measure-first-load.mjs [--json]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const NEXT = '.next';
const APP = join(NEXT, 'server', 'app');
const STATIC = join(NEXT, 'static', 'chunks');

const gz = new Map();
function sizes(file) {
  if (!gz.has(file)) {
    const buf = readFileSync(file);
    gz.set(file, { raw: buf.length, gzip: gzipSync(buf).length });
  }
  return gz.get(file);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const routes = JSON.parse(readFileSync(join(NEXT, 'app-path-routes-manifest.json'), 'utf8'));
const rows = [];
for (const route of [...new Set(Object.values(routes))].sort()) {
  if (route.startsWith('/api') || /\.(png|ico)$/.test(route)) continue;
  const html = join(APP, route === '/' ? 'index.html' : `${route}.html`);
  if (!existsSync(html)) {
    rows.push({ route, kind: 'dynamic' });
    continue;
  }
  const page = readFileSync(html, 'utf8');
  const chunks = new Set([...page.matchAll(/\/_next\/static\/chunks\/([^"'?\s]+\.js)/g)].map((m) => m[1]));
  let raw = 0;
  let gzip = 0;
  for (const c of chunks) {
    const f = join(STATIC, c);
    if (!existsSync(f)) continue;
    const s = sizes(f);
    raw += s.raw;
    gzip += s.gzip;
  }
  rows.push({ route, kind: 'static', chunks: chunks.size, raw, gzip });
}

const allChunks = walk(STATIC).filter((f) => f.endsWith('.js'));
const total = allChunks.reduce((t, f) => {
  const s = sizes(f);
  return { raw: t.raw + s.raw, gzip: t.gzip + s.gzip };
}, { raw: 0, gzip: 0 });
const heaviest = allChunks
  .map((f) => ({ file: relative(STATIC, f).replace(/\\/g, '/'), ...sizes(f) }))
  .sort((a, b) => b.raw - a.raw)
  .slice(0, 10);

const summary = {
  routes: rows,
  staticCount: rows.filter((r) => r.kind === 'static').length,
  dynamicCount: rows.filter((r) => r.kind === 'dynamic').length,
  totalJs: total,
  heaviest,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 1));
} else {
  const kb = (n) => (n / 1024).toFixed(1);
  console.log('| Route | Kind | First Load JS (gzip kB) | raw kB | chunks |');
  console.log('|---|---|---:|---:|---:|');
  for (const r of rows) {
    console.log(r.kind === 'dynamic' ? `| ${r.route} | dynamic | – | – | – |` : `| ${r.route} | static | ${kb(r.gzip)} | ${kb(r.raw)} | ${r.chunks} |`);
  }
  console.log(`\nStatic: ${summary.staticCount}, dynamic: ${summary.dynamicCount}. All client JS: ${kb(total.gzip)} kB gzip / ${kb(total.raw)} kB raw in ${allChunks.length} files.`);
}
