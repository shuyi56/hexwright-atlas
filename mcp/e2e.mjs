import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* End-to-end check of the whole chain: MCP client -> mcp/server.mjs -> dev server -> headless browser
   page -> window.hexwright. Run with `npm run test:e2e` (needs Chromium; see README). */
const here = dirname(fileURLToPath(import.meta.url)), out = process.env.E2E_OUT;
const client = new Client({ name: 'e2e', version: '0' }), transport = new StdioClientTransport({ command: process.execPath, args: [join(here, 'server.mjs')], stderr: 'inherit' });
await client.connect(transport);

const run = async (name, args = {}) => { const r = await client.callTool({ name: 'hexwright_' + name, arguments: args }); return r; };
const json = async (name, args) => { const r = await run(name, args); assert.ok(!r.isError, `${name}: ${r.content[0].text}`); return JSON.parse(r.content[0].text); };
const bad = async (name, args, re) => { const r = await run(name, args); assert.ok(r.isError, `${name} should fail`); assert.match(r.content[0].text, re); };

try {
  const tools = (await client.listTools()).tools.map(t => t.name);
  assert.ok(tools.includes('hexwright_paint') && tools.includes('hexwright_screenshot') && tools.includes('hexwright_pages'));

  const d = await json('describe'); assert.ok(d.terrain.length >= 30 && d.assets.length >= 50);
  const st = await json('state'); assert.equal(st.open, true);

  await json('newMap', { size: 12, biome: 'vale', name: 'e2e' });
  let r = await json('paint', { terrain: 'sand', rect: { x: 1, y: 1, w: 4, h: 3 } }); assert.equal(r.changed, 12);
  r = await json('elevation', { mode: 'set', level: 2, rect: { x: 6, y: 6, w: 3, h: 3 } }); assert.equal(r.changed, 9);
  r = await json('place', { id: 'cottage', x: 7, y: 7, face: 1 }); assert.equal(r.placed, true);
  r = await json('place', { id: 'cottage', x: 7, y: 7 }); assert.equal(r.placed, false); assert.match(r.reason, /already taken/);
  r = await json('place', { id: 'rowboat', x: 0, y: 0 }); assert.equal(r.placed, false); assert.match(r.reason, /water/);
  await bad('paint', { terrain: 'sandd', x: 0, y: 0 }, /unknown terrain "sandd".*sand/);
  await bad('paint', { terrain: 'sand', x: 99, y: 0 }, /outside the 12×12 map/);
  await bad('paint', { terain: 'sand', x: 0, y: 0 }, /unknown parameter "terain"/);

  const t = await json('getTile', { x: 7, y: 7 }); assert.equal(t.elevation, 2); assert.equal(t.piece.id, 'cottage');
  const a = await run('ascii'); assert.match(a.content[0].text, /terrain:/);

  const u = await json('useTool', { tool: 'paint', terrain: 'water', brush: 2, path: [[9, 1], [10, 1], [10, 2]] }); assert.equal(u.changed, 1);
  assert.equal((await json('getTile', { x: 10, y: 2 })).terrain, 'water');
  r = await json('place', { id: 'rowboat', x: 10, y: 2 }); assert.equal(r.placed, true);

  const b = await json('batch', { ops: [{ op: 'paint', terrain: 'dirt', x: 0, y: 11 }, { op: 'paint', terrain: 'nope', x: 0, y: 10 }] }).catch(e => e);
  const bb = await run('batch', { ops: [{ op: 'paint', terrain: 'dirt', x: 0, y: 11 }, { op: 'paint', terrain: 'nope', x: 0, y: 10 }] }); assert.ok(bb.isError); assert.notEqual((await json('getTile', { x: 0, y: 11 })).terrain, 'dirt', 'atomic batch must roll back');
  void b;

  const h = await json('state'); const undo0 = h.history.undo; assert.ok(undo0 >= 5);
  await json('undo', { steps: 1 }); assert.equal((await json('getTile', { x: 10, y: 2 })).piece, null);
  await json('redo'); assert.equal((await json('getTile', { x: 10, y: 2 })).piece.id, 'rowboat');

  const s = await json('tileToScreen', { x: 3, y: 3 }); assert.ok(s.visible);
  const back = await json('screenToTile', { sx: s.canvas.x, sy: s.canvas.y }); assert.deepEqual([back.x, back.y], [3, 3]);
  await json('setView', { rot: 1, zoom: 1.5, center: { x: 7, y: 7 }, grid: false });

  for (const [src, extra] of [['map', { scale: 1 }], ['map', { rect: { x: 5, y: 5, w: 5, h: 5 }, scale: 2 }], ['viewport', {}]]) {
    const im = await run('screenshot', { source: src, ...extra }); const img = im.content.find(c => c.type === 'image'); assert.ok(img && img.data.length > 2000, `${src} screenshot`);
    if (out) writeFileSync(join(out, `${src}${extra.rect ? '-crop' : ''}.png`), Buffer.from(img.data, 'base64'));
  }
  const map = await json('getMap'); assert.equal(map.size, 12); assert.equal(map.objects.length, 2);
  await json('setMap', { map }); assert.equal((await json('state')).objects, 2);
  console.log('e2e ok');
} finally { await client.close(); }
