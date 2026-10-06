import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ================= finding (or starting) the editor =================
   Dev server: the one at HEXWRIGHT_URL, else one already running on port 5173 (IPv4 or IPv6 loopback)
   that serves this checkout, preferring one with an editor page attached, else one started here on a
   free port. (On Windows, 127.0.0.1:5173 can be a WSL relay to some other checkout's dev server.)
   Browser, chosen by HEXWRIGHT_BROWSER or --browser=<mode>:
     auto      the page the user has open if there is one, else a headless Chromium (default)
     browser   only the user's own browser; never launches one (alias: none)
     headless  always a private headless Chromium, and every call goes to its page, never the user's
   That browser only hosts the page; it is never scripted. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.error('[hexwright-mcp]', ...a);
const MODES = ['auto', 'browser', 'headless'];

function browserMode() {
  const arg = process.argv.find(a => a.startsWith('--browser='));
  let m = (arg ? arg.slice(10) : process.env.HEXWRIGHT_BROWSER || 'auto').trim().toLowerCase();
  if (m === 'none') m = 'browser';
  if (!MODES.includes(m)) throw new Error(`unknown browser mode "${m}"; use one of ${MODES.join(', ')}`);
  return m;
}

class Backend {
  constructor() {
    this.mode = browserMode(); this.explicit = !!process.env.HEXWRIGHT_URL;
    this.candidates = this.explicit ? [process.env.HEXWRIGHT_URL.replace(/\/+$/, '')] : ['http://127.0.0.1:5173', 'http://[::1]:5173'];
    this.url = this.candidates[0]; this.vite = null; this.browser = null; this.pageId = null; this.starting = null; this.launched = false;
  }

  async http(path, init, url = this.url) {
    const r = await fetch(url + '/__hexwright' + path, { ...init, signal: AbortSignal.timeout(init && init.timeoutMs || 60000) });
    return r.json();
  }
  async pages(url) { try { return (await this.http('/pages', undefined, url)).pages; } catch { return null; } }
  async #probe(url) { try { const r = await this.http('/pages', { timeoutMs: 3000 }, url); return { url, pages: r.pages, ours: !!r.root && samePath(r.root, ROOT) }; } catch { return { url, pages: null }; } }

  /* the dev server to use: an explicit HEXWRIGHT_URL as is; otherwise one serving this checkout, preferring one with an editor page attached */
  async #pickServer() {
    const found = await Promise.all(this.candidates.map(url => this.#probe(url)));
    const best = this.explicit ? found[0].pages && found[0] : found.find(f => f.ours && f.pages.length) || found.find(f => f.ours);
    if (best) this.url = best.url;
    return best ? best.pages : null;
  }

  /* resolves once there is a dev server and an editor page to talk to */
  ensure() { return this.starting || (this.starting = this.#ensure().finally(() => { this.starting = null; })); }
  async #ensure() {
    let pages = this.vite || this.browser ? await this.pages() : await this.#pickServer();
    if (!pages) {
      if (this.explicit) throw new Error(`no Hexwright dev server answers at ${this.url}; start it with "npm run dev" or unset HEXWRIGHT_URL to let the MCP server start one`);
      await this.#startVite(); pages = await this.pages();
    }
    if (this.mode === 'headless') {
      if (!this.browser || !pages.some(p => p.id === this.pageId)) await this.#startBrowser(this.launched);
      if (!this.pageId) throw new Error(`the headless editor page did not connect to ${this.url}`);
      return;
    }
    if (pages.length) return;
    if (this.mode === 'browser') {
      for (let i = 0; i < 50; i++) { await sleep(200); pages = await this.pages(); if (pages && pages.length) return; }
      throw new Error(`no editor page is connected (browser mode); open ${this.url}/ in your browser, or set HEXWRIGHT_BROWSER=headless`);
    }
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
    try { this.browser = await chromium.launch({ headless: process.env.HEXWRIGHT_HEADED !== '1', executablePath: exe || undefined, args }); }
    catch (err) { throw new Error(/Executable doesn't exist/.test(err.message) ? `no Chromium found for the headless editor; run "npx playwright-core install chromium" or set HEXWRIGHT_CHROME${this.mode === 'auto' ? ', or open the editor in your browser' : ''}` : err.message, { cause: err }); }
    const page = await this.browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => log('page error:', e.message));
    await page.goto(this.url + '/');
    /* the id the page registers with the bridge under, so calls can be pinned to this page */
    this.pageId = await page.waitForFunction(() => sessionStorage.getItem('hexwright.page'), null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => null);
    for (let i = 0; i < 50 && this.pageId; i++) { const pages = await this.pages(); if (pages && pages.some(p => p.id === this.pageId)) break; await sleep(200); }
    this.launched = true;
    this.opened = false;
  }

  async call(method, params = {}, page) {
    await this.ensure();
    if (this.mode === 'headless') page = page || this.pageId;
    if (this.browser && !this.opened) { this.opened = true; await this.http('/api/open' + (this.pageId ? '?page=' + this.pageId : ''), { method: 'POST', body: '{}' }).catch(() => {}); }
    return this.http('/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params, page }) });
  }

  async close() { if (this.browser) await this.browser.close().catch(() => {}); if (this.vite) this.vite.kill(); }
}

const samePath = (a, b) => { const n = p => resolve(p).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };

/* a Chromium from PLAYWRIGHT_BROWSERS_PATH or the standard cache, so an already-installed browser is reused whatever its revision */
function findChrome() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME || '', '.cache', 'ms-playwright'), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'), join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright'), '/opt/pw-browsers'].filter(Boolean);
  for (const r of roots) {
    let dirs; try { dirs = readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort().reverse(); } catch { continue; }
    for (const d of dirs) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) { const p = join(r, d, sub); if (existsSync(p)) return p; }
  }
  return null;
}

export { Backend };
