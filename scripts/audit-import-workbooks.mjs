// scripts/audit-import-workbooks.mjs
// Offline audit of every historical workbook. No database access.
// Usage: node scripts/audit-import-workbooks.mjs <dir-with-xlsx> > docs/import-audit-report.md
import * as XLSX from 'xlsx';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_SHEETS = new Set(['pricelist', 'Del Sheet', 'Prod Sheet', 'Blank columns and rows']);
const isDaySheet = (n) => !SKIP_SHEETS.has(n) && /^Day\s*(0|\(\d+\))$/i.test(n);

function readPricelist(wb) {
  const ws = wb.Sheets['pricelist'];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const out = [];
  for (const r of aoa) {
    const name = r?.[0] != null ? String(r[0]).trim() : '';
    const rawPrice = r?.[1] != null ? String(r[1]).trim() : '';
    if (!name || !rawPrice) continue;
    if (/^(products|page\s+\d+)$/i.test(name)) continue;
    const price = parseFloat(rawPrice.replace(/[^\d.\-]/g, ''));
    if (Number.isNaN(price)) continue;
    out.push({ name, price });
  }
  return out;
}

function firstSheetDate(wb) {
  for (const sn of wb.SheetNames) {
    if (!isDaySheet(sn)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false });
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(k)) {
          const [m, d, y] = k.split('/').map(Number);
          const year = y < 100 ? 2000 + y : y;
          if (year < 2020) continue;
          return new Date(Date.UTC(year, m - 1, d)).toISOString().slice(0, 10);
        }
      }
    }
  }
  return null;
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/audit-import-workbooks.mjs <dir>'); process.exit(1); }
const files = readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f)).sort();

const perFile = [];
const priceTimeline = new Map(); // name -> [{date, prices:[]}]

for (const f of files) {
  const wb = XLSX.read(readFileSync(join(dir, f)), { type: 'buffer', cellDates: true });
  const date = firstSheetDate(wb);
  const list = readPricelist(wb);
  const byName = new Map();
  for (const { name, price } of list) {
    const k = name.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(price);
  }
  const collisions = [...byName].filter(([, p]) => p.length > 1 && new Set(p).size > 1);
  perFile.push({ file: f, date, skuCount: list.length, collisions });
  for (const [k, prices] of byName) {
    if (!priceTimeline.has(k)) priceTimeline.set(k, []);
    priceTimeline.get(k).push({ date, prices: [...new Set(prices)].sort((a, b) => a - b) });
  }
}

console.log('# Import audit report\n');
console.log(`Files scanned: ${files.length}\n`);

console.log('## Per-file summary\n');
console.log('| File | First date | SKUs | Colliding names |');
console.log('|---|---|---|---|');
for (const p of perFile) {
  const c = p.collisions.map(([n, pr]) => `${n} (${pr.join('/')})`).join('; ') || '—';
  console.log(`| ${p.file} | ${p.date ?? 'NONE'} | ${p.skuCount} | ${c} |`);
}

console.log('\n## Names that ever collide (need an alias decision)\n');
const everCollide = new Set();
for (const p of perFile) for (const [n] of p.collisions) everCollide.add(n);
for (const n of [...everCollide].sort()) {
  console.log(`- **${n}** — variants over time: ` +
    priceTimeline.get(n).map((t) => `${t.date}:[${t.prices.join(',')}]`).join(' '));
}
if (everCollide.size === 0) console.log('_none_');

console.log('\n## Price drift (single-variant names whose price changed)\n');
for (const [n, timeline] of [...priceTimeline].sort()) {
  if (everCollide.has(n)) continue;
  const distinct = [...new Set(timeline.map((t) => t.prices.join(',')))];
  if (distinct.length > 1) {
    console.log(`- **${n}**: ` + timeline.map((t) => `${t.date}=${t.prices.join(',')}`).join(' → '));
  }
}
