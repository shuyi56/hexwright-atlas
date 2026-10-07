# Character sprite design

This spec records how the character figures are drawn and why. It covers the choices agreed while giving the
sprites more depth: what was kept, and what was tried and turned down. The code lives in
`src/characters/sprite.js` (the starter figures, drawn from parts) and `src/characters/draw.js` (the renderer).

![The seven starter characters in all four facings, standing and mid-step](images/character-sprite-sheet.png)

*The current sprite sheet: each starter in the four facings (sw, se, ne, nw), standing and mid-step.*

## Pipeline

Sprites are 32×32 pixel art with a per-sprite palette, four facings and two frames. The left-facing views mirror
the right-facing ones. The renderer turns each frame into an 8× master and then a mip chain:

1. **Labels.** Each pixel gets its colour and one of eight light steps. Each empty pixel bordering the figure
   becomes an outline pixel.
2. **Scale2x, three times.** This rounds staircases and corners wherever two sides agree.
3. **Thin outline.** The outline is trimmed to a little over half a sprite pixel.
4. **Paint.** Colours are washed toward the paper tone and faintly grained, like the map.
5. **Master overlays.** Details smaller than a sprite pixel (the eyes, see below) are drawn onto the 8× master.
6. **Mip chain.** Each level is half the last, so drawing never shrinks an image by more than half.

Details drawn on the master show when a figure is drawn large and blend away at map scale. That is intended.

## Light and shading

Light comes from the upper left, the same as the tiles and buildings.

- **Eight tone steps** (`TONE`, 0.6 to 1.27), worked out per pixel:
  - **Turn.** The body turns like a cylinder: a highlight a quarter of the way in from the left, the core shadow
    near the right, and a little light bounced back onto the very right edge.
  - **Parts.** Each part rounds itself. Its left edge catches light, and its right and lower edges turn away.
  - **Tops and creases.** A top facing open sky is brighter. A part tucked under another (under the hair, a
    brim, the belt) sits in that part's shadow.
  - **Feet.** The figure darkens toward the feet.
- **Highlights** lift toward a warm white (`LIT`), so pale cloth and hair still show a lit side.
- **Outline.** The ink is heavier on the shadow side. On the lit side it lets some of the colour through.
- **Cast shadow.** Three soft ellipses fall toward the lower right, like the buildings' shadows.

A broader five-tone version was tried to cut noise in the clothes and was turned down. Keep the eight steps.

## Body

- **Rounded torso.** The shoulders slope up to the collar over three rows, and the hem is rounded at its
  corners. The arms start just below the shoulder's curve.
- **Arms apart from the body.** Each arm has a dark line down its inner edge, at 0.48 of the sleeve colour.
  Where there is no vest, a crease runs down the torso beside each arm. Without these, arms blend into a body of
  the same cloth.

## Clothes

- **Farmer.** Blue bib-and-brace overalls (`#8297b0`): straps with brass buttons, a bib with a pocket, one shaded
  side, a single centre fold on the skirt and a darker hem. From behind, the braces run down the back. The
  overalls stay simple. Extra pleats and hem notches read as noise.
- **Guard.** A steel breastplate with a raised ridge over the red tunic, leaving tunic showing at the sides.
  Steel pauldrons, rows of mail on the sleeves, and a split tunic skirt below the belt.

## Face

### Eyes

- **Oval.** Each eye is still the original one-by-two pixel mark in the sprite. On the master it is redrawn as a
  dark oval covering the same area. The oval's edge takes the colour most of the eye's neighbours have, so a
  helmet nasal or a beard beside it is not mistaken for skin.
- **Iris and pupil.** The iris fills nearly the whole eye, leaving only a thin filament of white inside the dark
  rim. Each character can set its own iris colour (`iris` on the sprite, kept in its JSON); one that
  does not is chestnut brown. The starters take theirs from their own colours: chestnut for the villager, amber
  for the farmer's straw, steel grey for the guard, blue for the merchant's robe, dark brown for the monk,
  violet-grey for the healer's lavender, and green for the noble lady, to go with her red hair and emerald gown. The darker rim and lighter lower half are mixed from that one
  colour. It is shaded darker at the top, under the lid, and lighter at the bottom, with a small near-black pupil about a third of its width.
- **Glint.** A pinpoint of cream sits in the upper left of each eye, toward the light, about a quarter of a sprite
  pixel across. A larger glint was tried and read as a white blob; much smaller and it vanishes.
- **Upper lid.** A fine dark arc runs over each eye, and the dark rim round the eye is kept just as fine; heavier
  strokes were tried and made the eyes look outlined. It thickens toward the outer corner and ends in a short
  flick. The outer side follows the facing.
- **Lashes.** Characters marked `lashes` (the women; the healer and the noble lady among the starters) keep a
  fuller lid and a longer flick. Everyone else gets the softer lid.
- **Brows.** The sprite's one-pixel brow is redrawn as a low, nearly flat stroke in its own hair colour. It is a
  little wider than the eye and rises slightly toward the outer side.

Turned down for the eyes:
- Larger 2×2 eyes, since the original size stays.
- A full-pixel white catchlight, which read as a large white patch.
- Removing the glint altogether.

### Mouth and nose

The mouth and nose look exactly as they did before this work. The face's small marks (a colour on four pixels or
fewer in the head) and the skin around them keep the earlier plain, lit and shaded steps. With those, Scale2x
rounds the mouth into the same small smile. The eight-step shading would put the skin around the mouth in
shadow and turn the smile into a dark open mouth.

Rosy cheeks, a taller ear and a neck shadow were tried and taken out.

## Hair

- **Front.** Dark strands and a light sheen run through the fringe.
- **Back.** Two long locks fall from the crown on either side of the parting. More strands and sheen pixels
  were tried at the back and looked blotchy.
- **Long hair.** Strands carry down the sides.
- **Braid.** A `braid` character (the noble lady) gathers her hair down the far side into a three-pixel braid
  that falls over the shoulder in front and down the back behind. In front the lock and braid stay outside the
  face's edge: laid over the cheek, they took its shading and left the jaw misshapen. The gap under the jaw is
  filled with hair, since an empty pixel there is inked into a dark notch.
  A small lock also sits behind her near ear. Without it, hair on only the far side shifts each face row's
  lighting, and Scale2x rounds the top of her mouth into a lozenge instead of the shared small smile. Its lobes lean alternately left and right with
  a shadowed crease beneath each, and it ends in a ribbon and a tuft. Ringlets down the sides were tried and
  taken out; the braid alone reads cleaner.

## Dress

- **Gown.** A `gown` (worn over a `robe`) flares out to the floor with a gold-trimmed hem and two folds. In front
  it has a square neckline over a gold choker with a small jewel, in place of the open collar.
- **Circlet.** The `circlet` headpiece is a thin gold band across the hair with a jewel at the brow, seen
  from behind as the band alone.

## Data

- **Lashes flag.** A sprite may carry `lashes: true`. It is saved with the sprite and in map files, and it is
  only written when set.
- **Library key.** The sprite library's storage key is now `hexwright.sprites.v7`. On first load the starters
  are refreshed and the user's own characters are kept.

## Known limits

- Eye, lid, brow and glint details are smaller than a sprite pixel, so they vanish at map scale.
- The sprite editor has no switch for `lashes` yet, so new characters can't turn it on there.
- The back of the hair is busier than on main.
