/* ================= tile editor automation API: the contract =================
   Plain data, no DOM and no imports, so the in-page implementation (api.js), the Vite bridge and the
   MCP server (mcp/server.mjs) all read the very same method list. Coordinates are model tiles:
   x runs east, y runs south, (0, 0) is the top-left tile of the unrotated map. */
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const bool = description => ({ type: 'boolean', description });
const TOOLS = ['paint', 'fill', 'raise', 'lower', 'level', 'place', 'erase', 'pick', 'pan'];
const RECT = { type: 'object', description: 'Rectangle of tiles, clipped to the map.', properties: { x: int('left tile'), y: int('top tile'), w: int('width in tiles', { minimum: 1 }), h: int('height in tiles', { minimum: 1 }) }, required: ['x', 'y', 'w', 'h'] };
const TILES = { type: 'array', description: 'Explicit tile list [[x, y], ...].', items: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 } };
/* a target is a single tile (optionally widened by brush), an explicit list or a rectangle */
const TARGET = {
  x: int('tile x (single-tile target)'), y: int('tile y (single-tile target)'),
  brush: int('square brush size around x,y (1-3)', { minimum: 1, maximum: 3 }),
  tiles: TILES, rect: RECT
};
const PIECE = { id: str('asset id from describe().assets'), x: int('left tile of the footprint'), y: int('top tile of the footprint'), face: int('facing 0-3 (turns the piece, swaps a w×d footprint)', { minimum: 0, maximum: 3 }), v: { type: 'number', description: 'variation seed 0..1; omit for random' } };

const METHODS = {
  describe: { description: 'Catalogue of everything the editor knows: terrain ids, asset ids with footprints, biomes, tools and limits. Call this first.', input: {} },
  state: { description: 'Editor state: map name/size, current tool, selection, view (rotation, zoom), undo depth and the status line.', input: {} },
  open: { description: 'Show the tile editor screen (needed only for viewport screenshots, screen coordinates and zoom; map edits work either way).', input: {} },
  close: { description: 'Return to the atlas screen.', input: {} },

  getMap: { description: 'The whole map as hexwright-tiles JSON (the same format as Save): palette, per-tile terrain and elevation, objects.', input: {} },
  setMap: { description: 'Replace the map with hexwright-tiles JSON (undoable).', input: { map: { type: 'object', description: 'A hexwright-tiles document as returned by getMap.' } }, required: ['map'], mutates: true },
  newMap: { description: 'Start a blank map filled with one ground (undoable).', input: { size: int('map side, 4-96', { minimum: 4, maximum: 96 }), biome: str('biome id; sets the climate and default ground'), ground: str('terrain id to fill with; defaults to the biome ground'), name: str('map name') }, mutates: true },
  generate: { description: 'Generate a populated scene for a biome (terrain, river, settlement, farms, nature). Same seed gives the same scene (undoable).', input: { seed: str('any text; random if omitted'), size: int('map side, 4-96', { minimum: 4, maximum: 96 }), biome: str('biome id from describe().biomes') }, mutates: true },
  rename: { description: 'Rename the map.', input: { name: str('new name', { maxLength: 60 }) }, required: ['name'], mutates: true },

  getTile: { description: 'Terrain, elevation and the piece (if any) covering one tile.', input: { x: int('tile x'), y: int('tile y') }, required: ['x', 'y'] },
  getRegion: { description: 'Terrain ids, elevations and pieces for a rectangle of tiles.', input: RECT.properties, required: ['x', 'y', 'w', 'h'] },
  listObjects: { description: 'Placed pieces with their index, asset, position, facing and footprint. Indices shift when a piece is erased.', input: { id: str('only this asset id'), rect: RECT } },
  ascii: { description: 'Text picture of the map: a terrain layer (legend included), an elevation layer (digits) and an objects layer (piece index in base 36). The cheapest way to inspect a map.', input: { rect: RECT, layers: { type: 'array', items: { type: 'string', enum: ['terrain', 'elevation', 'objects'] }, description: 'default: all three' } } },

  paint: { description: 'Paint ground on a tile, brush, tile list or rectangle (undoable).', input: { terrain: str('terrain id'), ...TARGET }, required: ['terrain'], mutates: true },
  fill: { description: 'Flood-fill the connected ground of the same type under (x, y) with another ground (undoable). Pieces stay where they are.', input: { x: int('tile x'), y: int('tile y'), terrain: str('terrain id') }, required: ['x', 'y', 'terrain'], mutates: true },
  elevation: { description: 'Change height on a tile, brush, tile list or rectangle. mode "set" and "level" write `level` (0-6); "raise" and "lower" move by `amount` (default 1) (undoable).', input: { mode: { type: 'string', enum: ['set', 'level', 'raise', 'lower'] }, level: int('target height for set/level', { minimum: 0, maximum: 6 }), amount: int('steps for raise/lower', { minimum: 1, maximum: 6 }), ...TARGET }, required: ['mode'], mutates: true },
  place: { description: 'Place one piece. Fails with a reason (not thrown) if it leaves the map, overlaps a piece, or sits on the wrong kind of ground (boats need water, everything else dry) (undoable).', input: PIECE, required: ['id', 'x', 'y'], mutates: true },
  erase: { description: 'Remove the piece covering (x, y), the piece with a given index, or every piece touching a rectangle (undoable).', input: { x: int('tile x'), y: int('tile y'), index: int('piece index from listObjects'), rect: RECT }, mutates: true },
  moveObject: { description: 'Move and/or turn an existing piece, found by index or by a tile it covers (undoable). Fails with a reason if the new spot is invalid; the piece then stays put.', input: { index: int('piece index'), at: { type: 'object', properties: { x: int('tile x'), y: int('tile y') }, description: 'any tile the piece covers' }, to: { type: 'object', properties: { x: int('new left tile'), y: int('new top tile') } }, face: int('new facing 0-3', { minimum: 0, maximum: 3 }) }, mutates: true },
  useTool: { description: 'Drag the current editor tool along a path of tiles exactly as the mouse would, including brush size and overwrite rules (one undo step). Also updates the on-screen tool selection.', input: { tool: { type: 'string', enum: TOOLS.filter(t => t !== 'pan') }, path: { ...TILES, description: 'Tiles visited in order, [[x, y], ...].' }, terrain: str('terrain id for paint/fill'), asset: str('asset id for place'), face: int('facing 0-3 for place', { minimum: 0, maximum: 3 }), brush: int('brush size 1-3', { minimum: 1, maximum: 3 }) }, required: ['tool', 'path'], mutates: true },
  batch: { description: 'Run several edits as one undo step. ops are {op, ...args} where op is one of paint, fill, elevation, place, erase, moveObject, rename. Atomic by default: if one op throws, every earlier op is rolled back. A placement that merely does not fit is reported, not thrown.', input: { ops: { type: 'array', items: { type: 'object', properties: { op: { type: 'string', enum: ['paint', 'fill', 'elevation', 'place', 'erase', 'moveObject', 'rename'] } }, required: ['op'], additionalProperties: true } }, atomic: bool('roll back everything on an error (default true)') }, required: ['ops'], mutates: true },
  undo: { description: 'Undo the last edit(s).', input: { steps: int('how many (default 1)', { minimum: 1 }) } },
  redo: { description: 'Redo undone edit(s).', input: { steps: int('how many (default 1)', { minimum: 1 }) } },

  setSelection: { description: 'Set the editor selection shown in the UI: tool, terrain, asset, facing, brush size.', input: { tool: { type: 'string', enum: TOOLS }, terrain: str('terrain id'), asset: str('asset id'), face: int('facing 0-3', { minimum: 0, maximum: 3 }), brush: int('brush size 1-3', { minimum: 1, maximum: 3 }) } },
  setView: { description: 'Move the camera: quarter turns (rot 0-3), zoom as a multiple of fit-to-screen, grid on/off, centre on a tile, or fit. Needs the editor open.', input: { rot: int('quarter turns 0-3', { minimum: 0, maximum: 3 }), zoom: { type: 'number', description: 'multiple of the fit zoom (1 = whole map)' }, grid: bool('show the tile grid'), center: { type: 'object', properties: { x: int('tile x'), y: int('tile y') }, description: 'tile to put in the middle of the stage' }, fit: bool('fit the whole map first') } },
  screenshot: { description: 'PNG of the map. source "map" renders the model offscreen at any scale or rotation, with no UI and no dependence on window size; source "viewport" captures the on-screen canvas as the user sees it, with hover and tool overlays. Returns an image.', input: { source: { type: 'string', enum: ['map', 'viewport'], description: 'default map' }, scale: { type: 'number', description: 'map source: pixels per drawing unit, 0.25-3 (default 1)', minimum: 0.25, maximum: 3 }, rot: int('map source: quarter turns (default: current view)', { minimum: 0, maximum: 3 }), grid: bool('map source: draw the tile grid (default off)'), rect: { ...RECT, description: 'map source: crop to a rectangle of tiles' }, maxSize: int('longest side in pixels (default 1600)', { minimum: 64, maximum: 4096 }) }, image: true },
  tileToScreen: { description: 'Where a tile centre appears on the page, in canvas and client pixels. Lets any real mouse or touch input be aimed without guessing. Needs the editor open.', input: { x: int('tile x'), y: int('tile y') }, required: ['x', 'y'] },
  screenToTile: { description: 'The tile under a canvas pixel (null if none). Needs the editor open.', input: { sx: { type: 'number', description: 'canvas x in CSS px' }, sy: { type: 'number', description: 'canvas y in CSS px' } }, required: ['sx', 'sy'] }
};

export { METHODS, TOOLS };
