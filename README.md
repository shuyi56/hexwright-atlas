# Hexwright Atlas

A procedural, hand-drawn-style hex-map atlas. Give it a seed and it generates a fantasy realm
(terrain, rivers, roads, settlements, names) on a canvas, and lets you "enter" any city to see an
isometric district map.

## Tile editor

The **Tile editor** button opens an isometric workbench built on the same tile set as the city
districts. Paint 34 kinds of ground, raise and lower terrain, place buildings, props, plants, room pieces and furniture,
turn pieces (`R`) and the view (`[` `]`), undo with `Ctrl+Z`, and export PNG or JSON. **Generate**
builds a starting scene for one of six lands (river vale, island harbour, desert oasis, frozen fells,
fenland, ashlands). On the realm map, **Enter hex** in any hex's survey opens a tiled map of that hex,
generated from the atlas: its biome blended into its neighbours', coast or lake shore on the sides that touch
water, rivers and roads crossing the same sides as on the map, farmland, and the village, town, keep, ruin or
other feature that stands there (a city or abbey hex brings its whole city plan). Inside a city, **Enter
district** opens just the selected district. The map is autosaved in the browser.

### Interiors

The **Interior** tab holds room pieces and furniture, and the Terrain tab has a **Floors** group (floorboards,
dark oak, stone, a chequered floor, red and blue carpet, strewn rushes).

- **Room pieces:** an interior wall, a wall with a window, a doorway, a fireplace, stairs and a timber post. Walls are
  kept low, cut away like a dolls' house so the room stays visible, and they join the room pieces beside them
  into corners and tees. Characters can walk through a doorway; every other piece blocks them.
- **Furniture:** a bed, a straw cot, a table, a long table, a chair, a stool, a bench, a chest, a wardrobe, a
  bookshelf, a dresser, a writing desk, a counter, a cooking pot, a wash tub, a candle stand, a potted plant, a
  throne, an altar, a pew, a weapon rack and a spinning wheel. Each is drawn in its own frame, so `R` turns it
  to face any of the four ways and turning the view shows its back.

### Storeys

A map has a ground level and up to three floors above it. The **floor** switch in the bottom-left corner (a stack of 3, 2, 1 and G, or
`PgUp`/`PgDn`) chooses the storey you work on. Every tool acts on that storey, and the floors above it are
hidden so you can always see inside.

- **Laying floors:** on floors 1-3, **Paint** and **Fill** lay floor tiles in any terrain (floorboards,
  carpet and so on), and **Erase** takes up floor where no piece or character stands. A floor sits one storey
  (16 units) above the ground under it.
- **Furnishing:** pieces and characters belong to the storey they were placed on. They only collide with
  things on that storey, so a bedroom can sit directly over the kitchen.
- **Stairs:** the **Stairs** piece (Interior tab) joins two storeys. It rises towards its back, and a
  character on it steps off its top end onto the floor tile behind it, one storey up. Leave that tile's
  floor in place and take up the floor over the stairs for a stairwell. With **Walk**, clicking any reachable
  tile on any storey routes the character there, up and down stairs as needed. Clicking a flight of stairs
  sends the selected character up it (clicking them while they stand on a flight does too), and clicking the
  open stairwell from the floor above brings them down onto it. The floor switch follows the selected character
  to whichever storey they step onto.
- **Heights:** raising and lowering land works on the ground only. A floor follows the ground under it, so
  walking keeps the one-level step everywhere: on the ground, along a floor laid over a slope, and onto the
  landing at the top of a flight.

Saved maps include their floors, and maps without them save exactly as before. In the automation API, edits
and lookups take a `level` (`paint`, `fill`, `place`, `erase`, `moveObject`, `getTile`, `listObjects`,
`ascii`, `placeCharacter`, `walkCharacter` (which returns the route it took), `removeCharacter`). `removeFloor` takes floor up, and
`setView({ level })` switches the storey.

### Characters

The **Characters** tab lists your character library. Six detailed starters come with it: a villager in a vest, a
farmer in a straw hat and apron, a guard with helmet, cape and spear, a bearded merchant with a satchel, a hooded
monk with a rope belt, and a healer. **Draw new character…** opens the **character editor**: a 32×32 pixel canvas with
pencil, eraser, fill and pick, a symmetry mode, a ghost of the other frame, shift/flip/clear, and a colour
list that starts from the tile set's own palette. Each character has four facings (front/back,
left/right), each with a standing frame and a stride frame. **Mirror to other side** copies a facing,
flipped. Every stroke saves to the library at once, and characters can be exported and imported as
`.character.json`.

On the map, characters are crisp pixel art in the tiles' pale palette. The renderer washes each colour
slightly toward the paper tone and adds the map's faint grain. It draws a one-pixel outline in the tiles' ink,
softened by the colour it borders, and lights each part from the left in gentle pixel steps, the way the pieces
are lit. On the map, every zoom draws from one master per frame. The
master is rendered at 8×, with its staircases rounded off by Scale2x and a fine outline, and pre-shrunk in halving
steps. Each zoom uses the smallest step that still has enough pixels, so the character looks the same zoomed out
or in, and stays sharp up close. A figure stands about as tall as a cottage's eaves. Characters drawn
at 16×16 in an earlier version are doubled to 32×32 when they load. **Shaded** in the character editor and
the **On the map** preview, which shows each facing on a grass block, display that finished look while you
draw.

Movement is by clicking. Pick a sprite and click a free tile with **Person** (`C`) to stand it there (`R`
turns it). With **Walk** (`W`), click a character, then click a tile. The ground it can reach is tinted, the
route to the tile under the pointer is traced, and it walks the shortest way there. Clicking a character with
Person also picks it up for walking. A tile is free when it is dry, not lava, and holds neither a piece nor
another character; a step may climb or drop one height level at most. Characters walk behind and in front of
buildings correctly, are saved inside the map JSON together with their sprites, and are on the same undo
stack as every other edit. The automation API has `listSprites`, `listCharacters`, `placeCharacter`,
`walkCharacter` and `removeCharacter`.

### Test scenes

`scenes/` holds self-contained HTML test pages. Each one is the whole app inlined into a single file that
opens straight from disk, with no server. It has a tile map preloaded in the editor and a panel of walking
checks that run on load. `scenes/hillside-tower.html` is the hillside scene: a terrace reached by one ramp
tile, a three-level tower joined by two flights of stairs, a summit ringed by cliffs, and a two-storey house.

- **Checking routes:** each check walks a character through the automation API and audits the route. Every
  step must be one tile and at most one height level of climb, and storeys may only change on stairs. The page
  shows pass or fail, with the route's step count, heights and storey changes. **Re-run** repeats the checks,
  and clicking a check replays that walk on screen.
- **Scripted browsers:** results are in `window.__sceneResults`.
- **Rebuilding:** run `npm run scene -- <map.json> [out.html]` to rebuild a page from a saved map. The checks
  come from a `<map>.checks.json` beside it, if there is one; see `src/editor/fixtures/hillside-tower.checks.json`
  for the format. The same scene is replayed by `src/editor/scene.test.js` under `npm test`.

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
| Edit     | `paint`, `fill`, `elevation`, `place`, `erase`, `moveObject`, `removeFloor`, `placeCharacter`, `walkCharacter`, `removeCharacter`, `useTool` (a drag path), `batch` (atomic, one undo step), `rename` |
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
| `npm run scene -- <map.json>` | Build a self-contained HTML test page for a scene into `scenes/` |
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
