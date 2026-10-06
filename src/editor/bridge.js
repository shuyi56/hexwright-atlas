import { call } from './api.js';

/* ================= dev-server bridge (page side) =================
   Under `vite dev` the page registers itself with the dev server over Vite's own websocket. The server
   forwards API calls to it (POST /__hexwright/api/<method>, or the MCP server) and the page answers
   from window.hexwright. Nothing here ships in the production build. */
const hot = import.meta.hot;
if (hot) {
  let id; try { id = sessionStorage.getItem('hexwright.page') || (sessionStorage.setItem('hexwright.page', Math.random().toString(36).slice(2, 10)), sessionStorage.getItem('hexwright.page')); } catch { /* storage blocked */ }
  id = id || Math.random().toString(36).slice(2, 10);
  const hello = () => hot.send('hexwright:hello', { id, url: location.href, title: document.title, visible: document.visibilityState === 'visible' });
  hot.on('vite:ws:connect', hello); hot.on('hexwright:ping', hello);
  document.addEventListener('visibilitychange', hello); addEventListener('focus', hello);
  addEventListener('pagehide', () => hot.send('hexwright:bye', { id }));
  hot.on('hexwright:call', async ({ callId, method, params }) => {
    try { hot.send('hexwright:result', { callId, ok: true, result: (await call(method, params)) ?? null }); }
    catch (err) { hot.send('hexwright:result', { callId, ok: false, error: { message: err && err.message || String(err), name: err && err.name } }); }
  });
  hello();
}
