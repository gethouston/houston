# Mode and palette are two axes, and imported palettes are derived

Houston ships a palette library: twelve colour sets the user picks from. `data-theme` on `<html>` is the resolved **mode** (`light` | `dark`) and keeps every meaning it has: the `dark:` variant, `color-scheme`, the aurora. `data-palette="<id>"` selects the **set**. Houston Light and Houston Dark are the two defaults, and they are the authored token source itself: they emit no `[data-palette]` block, because they ARE the `:root` / `[data-theme]` blocks. Every generated value in those three blocks is byte-identical to what shipped before the library existed, which `packages/design-tokens/test/zero-diff.test.ts` proves.

The ten imported palettes come from `packages/design-tokens/vendor/omarchy/<theme>/colors.toml` (unmodified Omarchy themes, MIT; attribution in that directory's README). A `colors.toml` is a flat list of 25 hues plus a `mode` line, which is a terminal's vocabulary, not a product's: it has no card tier, no popover, no frosted screen, no contrast guarantee against anything but its own background. So a palette is **derived**, by one table of rules, into the complete `--ht-*` role set (`build/palette.mjs` + `palette-surfaces.mjs` + `palette-text.mjs`), and emitted as one `[data-palette="<id>"]` block carrying every variable its mode's base block carries, colours and `--ht-shadow-*` alike. A complete set, never a patch: the block overrides the mode block on the same element, so one missing name would leave a Houston hex stranded in someone else's scheme. `test/palettes.test.ts` asserts set equality both ways.

Houston **authors** five families that no palette gets a say in, and an import inherits them from the Houston set of its own mode, unchanged: `glow.*` (the brand comet), `agent.*` (helmets), `filetype.*` (glyph tints), `person.*` (human avatars) and `flash`, plus every elevation tier. These are identity and effect, not surface, and each is already tuned against the ladder every palette keeps.

## The derivation table

`P` is the palette's own key. `mix(a, b, t)` is sRGB interpolation, `rgba(c, a)` the colour at that alpha, `composite(f, b)` source-over painting.

| role | light | dark |
| --- | --- | --- |
| `base` | mix(P.background, P.foreground, 4%) | P.darker_background |
| `background` | P.background | rgba(P.background, 0.55) |
| `pane` | P.background | transparent |
| `input` | mix(bg, fg, 1.5%) | P.background |
| `field` | same as `input` | rgba(line-input, 0.3) |
| `field-hover` | mix(bg, fg, 6%) | rgba(line-input, 0.5) |
| `card` / `card-hover` | rgba(P.background, 0.68 / 0.76) | rgba(P.lighter_background, 0.5 / 0.58) |
| `card-solid`, `tab-active` | P.background | composite(rgba(P.background, 0.55), P.darker_background) |
| `popover`, `dialog` | P.background | P.lighter_background |
| `chip-solid` | P.lighter_background, or mix(bg, fg, 6%) when luminance says it is darker than the background | P.lighter_background |
| `chip-solid-hover` | mix(bg, fg, 10%) | mix(P.lighter_background, fg, 6%) |
| `line` | rgba(P.accent, 0.10) | rgba(fg, 0.10) |
| `line-input` | mix(bg, fg, 12%) | mix(bg, fg, 15%) |
| `hover` · `chip` · `chip-subtle` · `tab-track` · `sidebar-line` · `sidebar-hover` · `sidebar-active` | rgba(fg, 0.06 · 0.035 · 0.035 · 0.06 · 0.06 · 0.06 · 0.10) | rgba(fg, 0.08 · 0.05 · 0.045 · 0.06 · 0.08 · 0.06 · 0.10) |
| `sidebar` | transparent | transparent |
| `ink` · `card-text` · `popover-text` · `chip-text` · `sidebar-text` · `sidebar-hover-text` · `hover-text` · `action` · `focus` | P.foreground | P.foreground |
| `prose-text` | P.foreground | P.bright_foreground |
| `action-text` | P.background | P.background |
| `bubble` / `bubble-text` | P.foreground / P.background | rgba(fg, 0.045) / P.bright_foreground |
| `bubble-chip` / `bubble-chip-text` | rgba(P.background, 0.20) / P.background | rgba(fg, 0.10) / P.foreground |
| `danger` · `success` · `warning` | P.red · P.green · P.yellow | same |
| `danger-text` · `success-text` · `warning-text` | whichever of P.background, P.bright_foreground, black, white reads best on the fill | same |
| `danger-fill` / `danger-ring` | P.red / rgba(P.red, 0.20) | rgba(P.red, 0.60) / rgba(P.red, 0.40) |
| `highlight` | rgba(P.yellow, 0.45) | rgba(P.yellow, 0.34) |
| `ink-muted` · `link` · `danger-ink` · `success-ink` · `warning-ink` · `highlight-text` | nudged (below) | nudged (below) |

The alpha constants are Houston's own, per mode, with the palette's foreground as the colour: a wash is ink laid thinly, so it re-tints itself when the surface moves. Houston's light `hover`, `field-hover` and `chip-solid` ship as opaque grays (`#efefef` is ink at ~6% on white), so the light ladder spends the same 6% as an explicit mix and those tiers stay opaque.

Two rules deserve their reason. The **screen-tone rule**: a dark `card-solid` is the frosted screen's own composited tone, so a board card reads as the screen showing through its column tray rather than a slab laid on it. And the **light chip fallback**: Omarchy's `lighter_background` means "one step in the dark direction", so in a light palette it is usually the *darker* neighbour, and `white` sets it to `#c0c0c0`, far too heavy for a chip. When luminance says it sits below the background, the chip falls back to Houston's own recess. All five light palettes take that fallback today; the build prints one note per palette when they do.

## Contrast floors

An imported hue is tuned for a terminal, where text sits on one flat background. Houston sets the same hue on a field, a translucent screen, a recessed row, and a chip washed with that hue itself. So the six roles worn AS TEXT are stepped toward the palette's own ink in 2% mixes until they clear their floor on every one of those surfaces: `link`, `danger-ink`, `success-ink`, `warning-ink` and `highlight-text` at 4.5:1, `ink-muted` at 3:1. The status inks are also measured on their own 10% and 15% washes, which tint the backdrop toward the ink and are the real floor. Moving toward ink always raises contrast, since ink is the darkest thing in a light palette and the brightest in a dark one, so the ladder is monotone and its last rung is ink itself. A palette whose own ink misses the floor is a build error. `test/palettes.test.ts` re-measures every floor from the generated CSS, for all ten imports.

## A pinned mode resolves the Houston set

`[data-theme="light"]` on a subtree (the first-run flow's calm setup canvas, the sign-in card) resolves the **Houston** light set, not the user's chosen light palette. That is the design, and it follows from where the declarations sit: the palette block is on `<html>`, the pin is on a descendant, and a declaration on the element itself wins. A pinned subtree is chrome that has one authored look; it defies the app theme on purpose, and a palette is the user's choice of app theme.

## Adding a palette

1. Drop `<theme>/colors.toml` into `packages/design-tokens/vendor/omarchy/` (the README there has the fetch command) and list the theme in its table.
2. Add one line to `PALETTE_ORDER` in `build/omarchy.mjs`: the id, the display name, and the mode group. The file's own `mode` line must agree, or the build fails.
3. `pnpm --filter @houston/design-tokens build && pnpm --filter @houston/design-tokens test`. The CSS block, the `palettes` export and the `PaletteId` union all follow; the tests cover the new palette by looping the export. Read the build's notes for the nudges and fallbacks it applied.

A palette needing a hand-written value is a signal the table is wrong, not that the palette is special: fix the rule.

## Considered Options

- **A palette as a patch** (redeclaring only the dozen variables that "matter"): smaller CSS, but every unpatched role keeps a Houston hex, and which roles those are drifts silently with every token added. Rejected: a set is either complete or wrong.
- **Authoring all twelve sets by hand** as token JSON: full control per palette, at the cost of twelve files to re-tune on every token added and no contrast guarantee. Rejected: the table is the product decision, and a hand-authored set hides it.
- **A third axis for the palette's own "mode"** (letting a light palette be worn in dark mode): meaningless. A palette's mode is a property of its hexes, so it decides which structure it wears; the picker groups by it rather than offering the cross product.
