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

The **Characters** tab lists the roster: sixteen pixel-art figures, 64×96 and big-headed, in the manner of
Final Fantasy Tactics and Tactics Ogre.

- **Townsfolk:** a villager in a vest, a farmer in a straw hat and overalls, a guard with a kettle helm, cape and
  spear, a bearded merchant with a satchel, a hooded monk with a rope belt, a healer with a satchel marked with a
  cross, and a red-haired noble lady in a green gown and gold circlet.
- **Jobs:** squire, knight, archer, thief, dragoon, valkyrie, black mage, white mage and summoner.

Each character faces four ways, standing or walking, and is painted in the tile set's own soft palette and
outlined in the tiles' ink. On the map every zoom draws from one master per frame, rendered at 8× with each sprite
pixel a crisp square and pre-shrunk in halving steps. So a figure keeps its pixel art up close and stays clean
zoomed out. A figure stands about as tall as a cottage's eaves.

Movement is by clicking. Pick a character and click a free tile with **Person** (`C`) to stand it there (`R`
turns it). With **Walk** (`W`), click a character, then click a tile. The ground it can reach is tinted, the
route to the tile under the pointer is traced, and it walks the shortest way there, its arms swinging with its
strides. Clicking a character with Person also picks it up for walking. A tile is free when it is dry, not lava,
and holds neither a piece nor another character; a step may climb or drop one height level at most. Characters
walk behind and in front of buildings correctly, and are on the same undo stack as every other edit.

**New character…** opens the **character maker**. A character is built from choices:

- **Body:** build, clothes, sleeves.
- **Head:** hair, hat, beard.
- **Gear:** what they hold, a shield, a cape, a satchel.

Each material gets a colour from the tile set's swatches or any colour. The preview walks the character in all four
facings. Characters can start from any of the townsfolk, and **Edit…** changes a made one or a copy of a
townsperson. Made characters save to your character library in the browser as you go, appear under **Made here**,
and travel inside any map they stand on.

The map JSON names each character by its id. Maps saved with the first, hand-painted character style still
open: their starters come back as the same people in this style, and characters painted in the old sprite editor
come back as villagers. The automation API has `listSprites`, `makeCharacter`, `listCharacters`,
`placeCharacter`, `walkCharacter` and `removeCharacter`. See [docs/character-design.md](docs/character-design.md).

### Character sprite sheet

`src/characters/` draws the roster in plain Node, with no DOM.

- **Palette.** Each colour is picked from the tiles' own and washed toward their paper, then shaded in gentle steps
  and outlined in the tiles' umber ink.
- **Walking.** The arms swing with the legs. `docs/images/character-walk.png` shows everyone walking in all four
  facings.
- **Builds.** Bodies come in four builds (slim, standard, stocky, tall), cut from measurements, and anyone can be
  drawn in any build.

`npm run sheet` draws the sheet into `docs/images/character-sprite-sheet.png`, with every figure on the editor's grass
tile, and the walk into `docs/images/character-walk.png`. Add `--strips` for one 1× strip per character.

![The character roster](docs/images/character-sprite-sheet.png)

![The character roster walking](docs/images/character-walk.png)

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
| `npm run sheet`   | Draw the character sprite sheet and walk into `docs/images/` |
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
  characters/         Characters: pixel engine, body builds, shared parts, the townsfolk and the jobs, drawing
                      them on the map, the sprite sheet layout and its pixel font
  editor/             Tile editor: map model, pure ops, renderer, scene generator, city and hex import, UI,
                      automation API (api-spec, api, bridge)
tools/                Vite plugin that relays HTTP calls to the editor page (dev server only),
                      the character sheet writer and a minimal PNG and APNG encoder
mcp/                  MCP server, backend launcher and end-to-end test
  ui/                 Shared state, map drawing, view/pan/zoom, input, ledger panel, city view
legacy/               The original single-file artifact, kept for reference
```

`src/ui/state.js` holds the mutable view state (`state.z`, `state.ox`, `state.map`, ...) that the
UI modules share.
