import { METHODS } from '../src/editor/api-spec.js';
import { deleteClass, readClasses, writeClass } from './classes-store.mjs';
import { deleteUnit, readUnits, writeUnit } from './npcs-store.mjs';
import { deleteSkill, readSkills, writeSkill } from './skills-store.mjs';

/* ================= Hexwright bridge: Vite plugin (server side) =================
   Lets anything that can speak HTTP drive the tile editor open in a real browser:

     GET  /__hexwright/pages            connected editor pages, and the project root served
     GET  /__hexwright/spec             the method list with JSON schemas
     POST /__hexwright/api/<method>     body = params, answer = { ok, result } or { ok: false, error }
     POST /__hexwright/call             { method, params, page?, timeoutMs? }
     GET    /__hexwright/classes              every class data file (data/classes/), normalized
     PUT    /__hexwright/classes/<id>         body = the class; writes data/classes/<id>.json
     DELETE /__hexwright/classes/<id>         removes that file
     GET    /__hexwright/npcs                 every NPC data file (data/npcs/), normalized, with its group
     PUT    /__hexwright/npcs/<group>/<id>    body = the NPC; writes data/npcs/<group>/<id>.json, and drops it from
                                              the other group
     DELETE /__hexwright/npcs/<group>/<id>    removes that file
     GET    /__hexwright/skills               every skill data file (data/skills/), normalized
     PUT    /__hexwright/skills/<id>          body = the skill; writes data/skills/<id>.json
     DELETE /__hexwright/skills/<id>          removes that file

   Calls travel over Vite's HMR websocket to src/editor/bridge.js in the page, which runs them on
   window.hexwright. The MCP server in mcp/ is a thin client of these endpoints. The classes and npcs endpoints are
   how the class editor (classes.html) saves; they touch only files under data/classes/ (tools/classes-store.mjs)
   and data/npcs/ (tools/npcs-store.mjs). The skills
   endpoints are the same for the skill editor (skills.html) and data/skills/ (tools/skills-store.mjs). Dev server
   only. */
export default function hexwrightBridge() {
  return {
    name: 'hexwright-bridge', apply: 'serve',
    configureServer(server) {
      const pages = new Map(), pending = new Map(); let seq = 0;
      const live = () => { for (const [id, p] of pages) if (p.client.socket.readyState !== 1) pages.delete(id); return [...pages.values()]; };
      const pub = p => ({ id: p.id, url: p.url, title: p.title, visible: p.visible, connectedAt: new Date(p.since).toISOString(), lastSeen: new Date(p.seen).toISOString() });
      const best = () => live().sort((a, b) => (b.visible - a.visible) || (b.seen - a.seen))[0];

      server.ws.on('hexwright:hello', (d, client) => { const old = pages.get(d.id); pages.set(d.id, { ...d, client, since: old ? old.since : Date.now(), seen: Date.now() }); });
      server.ws.on('hexwright:bye', d => pages.delete(d.id));
      server.ws.on('hexwright:result', d => { const w = pending.get(d.callId); if (!w) return; pending.delete(d.callId); clearTimeout(w.timer); w.resolve(d); });

      function dispatch(method, params, pageId, timeoutMs = 30000) {
        if (!METHODS[method]) return Promise.resolve({ ok: false, status: 404, error: { message: `unknown method "${method}"; known: ${Object.keys(METHODS).join(', ')}` } });
        live(); const page = pageId ? pages.get(pageId) : best();
        if (!page) return Promise.resolve({ ok: false, status: 503, error: { message: pageId ? `no connected page "${pageId}"` : 'no editor page is connected; open the dev server URL in a browser' } });
        return new Promise(resolve => {
          const callId = `c${++seq}`, timer = setTimeout(() => { pending.delete(callId); resolve({ ok: false, status: 504, error: { message: `page ${page.id} did not answer ${method} within ${timeoutMs} ms` } }); }, timeoutMs);
          pending.set(callId, { resolve: d => resolve({ ok: d.ok, result: d.result, error: d.error, page: page.id }), timer });
          page.client.send('hexwright:call', { callId, method, params: params || {} });
        });
      }

      const body = req => new Promise((res, rej) => { let s = ''; req.on('data', c => { s += c; if (s.length > 64e6) { rej(new Error('body too large')); req.destroy(); } }); req.on('end', () => { try { res(s ? JSON.parse(s) : {}); } catch { rej(new Error('body is not valid JSON')); } }); req.on('error', rej); });
      const send = (res, code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(obj)); };

      server.middlewares.use('/__hexwright', async (req, res) => {
        try {
          const path = (req.url || '/').split('?')[0].replace(/\/+$/, '');
          if (path === '/pages' && req.method === 'GET') { live().forEach(p => p.client.send('hexwright:ping', {})); return send(res, 200, { root: server.config.root, pages: live().map(pub) }); }
          if (path === '/spec' && req.method === 'GET') return send(res, 200, { methods: METHODS });
          if (path === '/classes' && req.method === 'GET') return send(res, 200, { ok: true, classes: readClasses(server.config.root).map(({ file, cls }) => ({ file, cls })) });
          const cm = path.match(/^\/classes\/([a-z0-9-]+)$/);
          if (cm && req.method === 'PUT') {
            const raw = await body(req); if (raw.id !== cm[1]) return send(res, 400, { ok: false, error: { message: `the body's id "${raw.id}" does not match the path's "${cm[1]}"` } });
            try { return send(res, 200, { ok: true, ...writeClass(raw, server.config.root) }); } catch (err) { return send(res, 422, { ok: false, error: { message: err.message } }); }
          }
          if (cm && req.method === 'DELETE') return send(res, 200, { ok: true, deleted: deleteClass(cm[1], server.config.root) });
          if (path === '/npcs' && req.method === 'GET') return send(res, 200, { ok: true, npcs: readUnits(server.config.root).map(({ group, file, unit }) => ({ group, file, unit })) });
          const nm = path.match(/^\/npcs\/([a-z]+)\/([a-z0-9-]+)$/);
          if (nm && req.method === 'PUT') {
            const raw = await body(req); if (raw.id !== nm[2]) return send(res, 400, { ok: false, error: { message: `the body's id "${raw.id}" does not match the path's "${nm[2]}"` } });
            try { return send(res, 200, { ok: true, ...writeUnit(nm[1], raw, server.config.root) }); } catch (err) { return send(res, 422, { ok: false, error: { message: err.message } }); }
          }
          if (nm && req.method === 'DELETE') { try { return send(res, 200, { ok: true, deleted: deleteUnit(nm[1], nm[2], server.config.root) }); } catch (err) { return send(res, 422, { ok: false, error: { message: err.message } }); } }
          if (path === '/skills' && req.method === 'GET') return send(res, 200, { ok: true, skills: readSkills(server.config.root).map(({ file, skill }) => ({ file, skill })) });
          const sm = path.match(/^\/skills\/([a-z0-9-]+)$/);
          if (sm && req.method === 'PUT') {
            const raw = await body(req); if (raw.id !== sm[1]) return send(res, 400, { ok: false, error: { message: `the body's id "${raw.id}" does not match the path's "${sm[1]}"` } });
            try { return send(res, 200, { ok: true, ...writeSkill(raw, server.config.root) }); } catch (err) { return send(res, 422, { ok: false, error: { message: err.message } }); }
          }
          if (sm && req.method === 'DELETE') return send(res, 200, { ok: true, deleted: deleteSkill(sm[1], server.config.root) });
          let method, params, page, timeoutMs;
          if (path.startsWith('/api/') && (req.method === 'POST' || req.method === 'GET')) { method = decodeURIComponent(path.slice(5)); params = req.method === 'POST' ? await body(req) : {}; page = new URL(req.url, 'http://x').searchParams.get('page') || undefined; }
          else if (path === '/call' && req.method === 'POST') ({ method, params, page, timeoutMs } = await body(req));
          else return send(res, 404, { ok: false, error: { message: 'not found; see GET /__hexwright/spec' } });
          const r = await dispatch(method, params, page, timeoutMs), { status = r.ok ? 200 : 422, ...out } = r;
          send(res, status, out);
        } catch (err) { send(res, 400, { ok: false, error: { message: err.message } }); }
      });
    }
  };
}
