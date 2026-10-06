#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { METHODS } from '../src/editor/api-spec.js';
import { Backend } from './backend.mjs';

/* ================= Hexwright tile editor: MCP server =================
   One tool per method in src/editor/api-spec.js, named hexwright_<method>. Each call is relayed to
   the editor page through the dev-server bridge (tools/vite-hexwright.js), so edits appear in the
   same browser the user is looking at, on the same undo stack as the mouse tools. */
let backend; try { backend = new Backend(); } catch (err) { console.error('[hexwright-mcp]', err.message); process.exit(2); }
const NAME = m => `hexwright_${m}`;
const tools = [
  ...Object.entries(METHODS).map(([m, s]) => ({ name: NAME(m), description: s.description, inputSchema: { type: 'object', properties: s.input, required: s.required || [], additionalProperties: false } })),
  { name: 'hexwright_pages', description: 'List the browser pages attached to the editor bridge, and the dev server URL. Use it to find where to look when the user has the editor open.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];
const text = t => ({ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 1) });

const server = new Server({ name: 'hexwright', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async ({ params: { name, arguments: args } }) => {
  try {
    if (name === 'hexwright_pages') { await backend.ensure(); return { content: [text({ url: backend.url, pages: await backend.pages() })] }; }
    const method = Object.keys(METHODS).find(m => NAME(m) === name);
    if (!method) throw new Error(`unknown tool ${name}`);
    const r = await backend.call(method, args || {});
    if (!r.ok) return { isError: true, content: [text(r.error.message)] };
    const res = r.result;
    if (METHODS[method].image) { const { image } = res; return { content: [{ type: 'image', data: image.base64, mimeType: image.mime }, text(`${image.width}×${image.height} px`)] }; }
    if (method === 'ascii') return { content: [text(`legend: ${JSON.stringify(res.legend || {})}\n\n${res.text}`)] };
    return { content: [text(res === null ? 'ok' : res)] };
  } catch (err) { return { isError: true, content: [text(err.message)] }; }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await backend.close(); process.exit(0); });
process.stdin.on('end', async () => { await backend.close(); process.exit(0); });
await server.connect(new StdioServerTransport());
