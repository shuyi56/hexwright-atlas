# Hexwright Atlas

A procedural, hand-drawn-style hex-map atlas. Give it a seed and it generates a fantasy realm
(terrain, rivers, roads, settlements, names) on a canvas, and lets you "enter" any city to see an
isometric district map.

## Tile editor

The **Tile editor** button opens an isometric workbench built on the same tile set as the city
districts. Paint 34 kinds of ground, raise and lower terrain, place 63 buildings, props and plants,
turn pieces (`R`) and the view (`[` `]`), undo with `Ctrl+Z`, and export PNG or JSON. **Generate**
builds a starting scene for one of six lands (river vale, island harbour, desert oasis, frozen fells,
fenland, ashlands). On the realm map, **Enter hex** in any hex's survey opens a tiled map of that hex,
generated from the atlas: its biome blended into its neighbours', coast or lake shore on the sides that touch
water, rivers and roads crossing the same sides as on the map, farmland, and the village, town, keep, ruin or
other feature that stands there (a city or abbey hex brings its whole city plan). Inside a city, **Enter
district** opens just the selected district. The map is autosaved in the browser.

### Characters

The **Characters** tab lists your character library; six starters (villager, farmer, guard, merchant, monk,
healer) come with it. **Draw new character…** opens the **character editor**: a 16×16 pixel canvas with
pencil, eraser, fill and pick, a symmetry mode, a ghost of the other frame, shift/flip/clear, and a colour
list that starts from the tile set's own palette. Each character has four facings (front/back,
left/right), each with a standing frame and a stride frame. **Mirror to other side** copies a facing,
flipped. Every stroke saves to the library at once, and characters can be exported and imported as
`.character.json`.

On the map, sprites are not shown as raw pixels. Each frame is smoothed (three Scale2x passes), outlined in
the same ink as the tiles, given ink lines where colours meet, lit from the left and shaded on the right like
the pieces, and grained like the paper. A figure stands a little taller than a cottage door. **Inked** in the
character editor and the **On the map** preview, which shows each facing on a grass block, display that
finished look while you draw.

Movement is by clicking. Pick a sprite and click a free tile with **Person** (`C`) to stand it there (`R`
turns it). With **Walk** (`W`), click a character, then click a tile. The ground it can reach is tinted, the
route to the tile under the pointer is traced, and it walks the shortest way there. Clicking a character with
Person also picks it up for walking. A tile is free when it is dry, not lava, and holds neither a piece nor
another character; a step may climb or drop one height level at most. Characters walk behind and in front of
buildings correctly, are saved inside the map JSON together with their sprites, and are on the same undo
stack as every other edit. The automation API has `listSprites`, `listCharacters`, `placeCharacter`,
`walkCharacter` and `removeCharacter`.

## Automation API and MCP server

The tile editor can be driven without a mouse or Playwright. Three layers share one method list
(`src/editor/api-spec.js`):

1. **In the page**: `window.hexwright.call(method, params)` (also `hexwright.paint(...)` and so on). It
   works in the dev server, a preview build and the deployed site, and edits land on the editor's own
   undo stack through the same operations (`src/editor/ops.js`) the mouse tools use.
2. **HTTP, under `npm run dev`**: a Vite plugin (`tools/vite-hexwright.js`) relays calls to the browser
   page that has the editor open.

   ```
   GET  /__hexwright/pages            connected editor pages
   GET  /__hexwright/spec             every method with its JSON schema
   POST /__hexwright/api/<method>     body = params -> { ok, result } | { ok: false, error }
   ```

   ```sh
   curl -s -XPOST localhost:5173/__hexwright/api/paint -d '{"terrain":"sand","rect":{"x":2,"y":2,"w":4,"h":3}}'
   ```
3. **MCP server** (`mcp/server.mjs`, registered in `.mcp.json`): one `hexwright_<method>` tool per method.
   It uses the dev server at `HEXWRIGHT_URL`, else one already on port 5173 (`127.0.0.1` or `[::1]`, preferring
   the one with an editor page attached), else it starts Vite on a free port. Which browser hosts the page is
   set by `HEXWRIGHT_BROWSER` (in `.mcp.json` `env`) or a `--browser=<mode>` argument:

   | Mode       | Behaviour |
   | ---------- | --------- |
   | `auto`     | Default. Drives the editor tab you have open; with none, starts a headless Chromium. |
   | `browser`  | Only your own browser: edits appear live in your tab. Never launches Chromium (`none` is an alias). |
   | `headless` | Always a private headless Chromium; calls go only to its page, never to your tabs. |

   `HEXWRIGHT_HEADED=1` shows the launched window, `HEXWRIGHT_CHROME` points at a specific binary. The browser
   only hosts the page; no clicks are scripted. Headless needs a Chromium: `npx playwright-core install chromium`.

Methods, all in model tile coordinates (x east, y south):

| Group    | Methods |
| -------- | ------- |
| Discover | `describe` (terrain, assets, biomes, limits), `state`, `ascii` (text map), `getTile`, `getRegion`, `listObjects`, `listSprites`, `listCharacters`, `getMap` |
| Edit     | `paint`, `fill`, `elevation`, `place`, `erase`, `moveObject`, `placeCharacter`, `walkCharacter`, `removeCharacter`, `useTool` (a drag path), `batch` (atomic, one undo step), `rename` |
| Map      | `newMap`, `generate`, `setMap`, `undo`, `redo` |
| View     | `open`, `close`, `setView` (rotation, zoom, centre, grid), `setSelection`, `tileToScreen`, `screenToTile` |
| See      | `screenshot` (`map`: offscreen render at any scale, rotation or tile crop; `viewport`: the on-screen canvas) |

Bad ids and ranges are rejected with a message that names the problem (`unknown terrain "sandd". Did you
mean sand?`), unknown parameter names are rejected, and a placement that does not fit returns
`{ placed: false, reason }` instead of failing silently.

`npm test` runs the unit tests for the pure operations. `npm run test:e2e` drives the whole chain
(MCP client, server, dev server, headless Chromium) and needs a Chromium: set `PLAYWRIGHT_BROWSERS_PATH`
or run `npx playwright-core install chromium`. `E2E_OUT=<dir>` saves the screenshots it takes.

`npm run perf` (after `npm run build`) clicks through the tile editor's tools on a 48×48 map in
headless Chromium and reads the browser's Event Timing entries, the numbers Interaction to Next Paint
is built from. It fails when an interaction's p75 latency passes 200 ms, or when the map image the
editor patched in place after those edits differs by a single pixel from a full render. CI runs it on
every pull request. `PERF_BUDGET_MS`, `PERF_SIZE` and `PERF_CPU_THROTTLE` adjust it.

## Scripts

| Command           | What it does                    |
| ----------------- | ------------------------------- |
| `npm install`     | Install dependencies            |
| `npm run dev`     | Start the Vite dev server       |
| `npm run build`   | Production build into `dist/`   |
| `npm run preview` | Serve the production build      |
| `npm run lint`    | Lint `src/`, `tools/`, `mcp/`   |
| `npm test`        | Unit tests (no browser needed)  |
| `npm run test:e2e`| MCP end-to-end test (Chromium)  |
| `npm run perf`    | Editor latency budget (Chromium)|
| `npm run mcp`     | Run the MCP server on stdio     |

Requires Node 18+.

## CI and hosting

`.github/workflows/ci.yml` lints and builds every pull request and every push to `main`. Pushes to
`main` also publish `dist/` to GitHub Pages at <https://shuyi56.github.io/hexwright-atlas/>. Pages
must be set to **Source: GitHub Actions** once, under the repository's Settings → Pages.

## Layout

```
index.html            App shell (markup + font links)
src/
  main.js             Boot: wires up the app and loads the first realm
  styles/main.css     All styles
  core/               Hex geometry, seeded RNG + noise, name generators
  world/              Biome data and the realm generator (terrain, rivers, settlements)
  render/             Canvas painting of the realm map
                      (relief, trees, terrain, settlements, rivers/roads, base compositor)
  city/               City districts: generation, architecture solids, 2.5D rendering
  tiles/              Shared isometric tile set: terrain tiles, buildings, props and nature,
                      drawn procedurally with a small iso kit (used by the city view and the editor)
  editor/             Tile editor: map model, pure ops, renderer, scene generator, city and hex import, UI,
                      automation API (api-spec, api, bridge)
tools/                Vite plugin that relays HTTP calls to the editor page (dev server only)
mcp/                  MCP server, backend launcher and end-to-end test
  ui/                 Shared state, map drawing, view/pan/zoom, input, ledger panel, city view
legacy/               The original single-file artifact, kept for reference
```

`src/ui/state.js` holds the mutable view state (`state.z`, `state.ox`, `state.map`, ...) that the
UI modules share.
