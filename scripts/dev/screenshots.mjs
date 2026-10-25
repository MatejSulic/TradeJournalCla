// Headless screenshots of every page × theme × viewport. Read-only against the target app.
// Usage: node scripts/dev/screenshots.mjs <outDir> [baseUrl=http://127.0.0.1:7420] [--only=dashboard,new]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const pos = args.filter(a => !a.startsWith('--'));
const outDir = pos[0];
const baseUrl = (pos[1] || 'http://127.0.0.1:7420').replace(/\/$/, '');
if (!outDir) {
  console.error('Usage: node scripts/dev/screenshots.mjs <outDir> [baseUrl] [--only=page1,page2]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const trades = await fetch(`${baseUrl}/api/trades`).then(r => r.json());
const detailId = trades[0]?.id;

const PAGES = [
  ['dashboard', '/dashboard'],
  ['dashboard-empty', '/dashboard?asset=MES&from=2099-01-01'],
  ['trades', '/trades'],
  ['detail', detailId != null ? `/trades/${detailId}` : null],
  ['new', '/trades/new'],
  ['newnotrade', '/trades/new', async page => {
    await page.getByRole('button', { name: 'No-trade day' }).click();
  }],
  ['series', '/series'],
  ['expenses', '/expenses'],
  ['ai', '/ai'],
].filter(([name]) => !only || only.includes(name));

const THEMES = ['light', 'dark'];
const VIEWPORTS = [{ width: 1600, height: 900 }, { width: 1366, height: 768 }];
const NO_SCROLL = new Set(['dashboard', 'new', 'newnotrade', 'ai']);

const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const fakeNoTrade = [
  { id: 999999, day_type: 'notrade', entry_time: `${ym}-05T09:00`, asset: null, direction: null, pnl: null,
    no_trade_reason: 'fake', faded_setups: 'x', entry_models: [], created_at: `${ym}-05T09:00`, updated_at: `${ym}-05T09:00` },
  { id: 999998, day_type: 'notrade', entry_time: `${ym}-06T09:00`, asset: null, direction: null, pnl: null,
    no_trade_reason: 'fake', faded_setups: null, entry_models: [], created_at: `${ym}-06T09:00`, updated_at: `${ym}-06T09:00` },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
let bad = false;

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    for (const [name, url, action] of PAGES) {
      if (!url) { console.log(`${name} ${theme} ${vp.width} SKIPPED (no trades)`); continue; }
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(t => { try { localStorage.setItem('theme', t); } catch {} }, theme);
      // Block any mutating API call — this script must never write to the target DB.
      await ctx.route('**/api/**', route => {
        const m = route.request().method();
        if (m !== 'GET' && m !== 'HEAD') return route.fulfill({ status: 403, body: '{"error":"blocked by screenshots.mjs"}' });
        return route.fallback();
      });
      await ctx.route('**/api/trades?day_type=notrade', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeNoTrade) }));
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`${msg.type()}: ${msg.text()}`);
      });
      page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

      let pageScroll = false, hasNaN = false;
      try {
        await page.goto(baseUrl + url, { waitUntil: 'networkidle' });
        if (action) { await action(page); await page.waitForLoadState('networkidle'); }
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(outDir, `${name}_${theme}_${vp.width}.png`) });
        pageScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
        hasNaN = (await page.content()).includes('NaN');
      } catch (e) {
        errors.push(`script: ${e.message.split('\n')[0]}`);
      }
      console.log(`${name} ${theme} ${vp.width} errors:${JSON.stringify(errors)} pageScroll:${pageScroll} NaN:${hasNaN}`);
      if (errors.length || hasNaN || (pageScroll && NO_SCROLL.has(name))) bad = true;
      await ctx.close();
    }
  }
}

await browser.close();
process.exit(bad ? 1 : 0);
