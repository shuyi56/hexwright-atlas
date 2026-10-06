import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ================= finding (or starting) the editor =================
   Order of preference: a dev server already running at HEXWRIGHT_URL (default http://127.0.0.1:5173),
   else one started here on a free port. If no browser page is attached to it, a headless Chromium is
   started and pointed at the page. That browser only hosts the page; it is never scripted. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.error('[hexwright-mcp]', ...a);

class Backend {
  constructor() { this.explicit = !!process.env.HEXWRIGHT_URL; this.url = (process.env.HEXWRIGHT_URL || 'http://127.0.0.1:5173').replace(/\/+$/, ''); this.vite = null; this.browser = null; this.starting = null; this.launched = false; }

  async http(path, init) {
    const r = await fetch(this.url + '/__hexwright' + path, { ...init, signal: AbortSignal.timeout(init && init.timeoutMs || 60000) });
    return r.json();
  }
  async pages() { try { return (await this.http('/pages')).pages; } catch { return null; } }

  /* resolves once there is a dev server and at least one connected editor page */
  ensure() { return this.starting || (this.starting = this.#ensure().finally(() => { this.starting = null; })); }
  async #ensure() {
    let pages = await this.pages();
    if (!pages) {
      if (this.explicit) throw new Error(`no Hexwright dev server answers at ${this.url}; start it with "npm run dev" or unset HEXWRIGHT_URL to let the MCP server start one`);
      await this.#startVite(); pages = await this.pages();
    }
    if (pages.length || process.env.HEXWRIGHT_BROWSER === 'none') return;
    if (!this.launched) await this.#startBrowser();
    for (let i = 0; i < 100; i++) { pages = await this.pages(); if (pages && pages.length) return; await sleep(200); }
    if (this.launched) await this.#startBrowser(true);
    for (let i = 0; i < 50; i++) { pages = await this.pages(); if (pages && pages.length) return; await sleep(200); }
    throw new Error(`no editor page connected to ${this.url}; open it in a browser`);
  }

  async #startVite() {
    const port = await new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    this.url = `http://127.0.0.1:${port}`;
    const bin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!existsSync(bin)) throw new Error('vite is not installed; run "npm install" in the repository first');
    log('starting dev server at', this.url);
    this.vite = spawn(process.execPath, [bin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    this.vite.on('exit', () => { this.vite = null; });
    for (let i = 0; i < 150; i++) { if (await this.pages()) return; if (!this.vite) break; await sleep(200); }
    throw new Error('the dev server did not come up');
  }

  async #startBrowser(restart) {
    if (this.browser) { await this.browser.close().catch(() => {}); this.browser = null; }
    let chromium; try { ({ chromium } = await import('playwright-core')); } catch { throw new Error('no browser page is connected and playwright-core is not installed (npm install); or open the dev server URL in a browser yourself'); }
    const exe = process.env.HEXWRIGHT_CHROME || findChrome(), args = process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [];
    log(restart ? 'restarting' : 'starting', 'headless browser', exe || '(playwright default)');
    this.browser = await chromium.launch({ headless: process.env.HEXWRIGHT_HEADED !== '1', executablePath: exe || undefined, args });
    const page = await this.browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => log('page error:', e.message));
    await page.goto(this.url + '/');
    this.launched = true;
    this.opened = false;
  }

  async call(method, params = {}, page) {
    await this.ensure();
    if (this.browser && !this.opened) { this.opened = true; await this.http('/api/open', { method: 'POST', body: '{}' }).catch(() => {}); }
    return this.http('/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params, page }) });
  }

  async close() { if (this.browser) await this.browser.close().catch(() => {}); if (this.vite) this.vite.kill(); }
}

/* a Chromium from PLAYWRIGHT_BROWSERS_PATH or the standard cache, so an already-installed browser is reused whatever its revision */
function findChrome() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME || '', '.cache', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    let dirs; try { dirs = readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort().reverse(); } catch { continue; }
    for (const d of dirs) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) { const p = join(r, d, sub); if (existsSync(p)) return p; }
  }
  return null;
}

export { Backend };
