# Design tokens: design decisions

Covers `packages/design-tokens/`: the token sources, the build that emits CSS and TypeScript, and its regression tests. Short file paths are relative to `packages/design-tokens/`.

## Zero-diff baseline

`test/legacy-resolved.json` pins the resolved value of every `--ht-*` custom property as it shipped before the token package, generated from `ui/core/src/globals.css` and `app/src/styles/futuristic.css` (futuristic imported last, so its overrides win). The generated `dist/css/tokens.css` is compared against it by parsed colour (r, g, b, a), not by string, so a reformat that renders the same pixels (`0.10` against `0.1`) passes and any real colour change fails. A deliberate visual change updates the tokens and the fixture in the same commit. A fixture is used instead of `git show` so the test stays hermetic. Elevation has no pre-token baseline and is not compared. Houston Light and Houston Dark emit no palette block: they are the `:root` and `[data-theme]` blocks, which is what keeps this proof intact.

Lives in `packages/design-tokens/test/zero-diff.test.ts`, `build/color.mjs`, `build/palette.mjs`.

## Tokens are emitted verbatim

`collect()` emits fully resolved DTCG tokens with no value transforms, so `$value` keeps the author's string. The build resolves source globs from the package root so the cwd does not matter (pnpm filter, sync test, CI). The committed `dist/` must equal a fresh build; the sync test builds to a temp `OUT_DIR` and diffs every file. The build runs only when invoked directly, so importing it has no side effects.

Lives in `packages/design-tokens/build/collect.mjs`, `build/index.mjs`, `test/sync.test.ts`.

## Forward slashes in Style Dictionary globs

Style Dictionary globs `source` with fast-glob, which needs forward slashes on every platform. On Windows `node:path.join` emits backslashes, which fast-glob reads as escapes, so the primitive and scale files never loaded and every cross-file reference failed ("Some token references could not be found") at `pnpm install`. Globs are joined, then forced to forward slashes, and file paths are normalized before the primitive filter so primitives cannot leak into output. The regression test simulates a Windows root so it holds on any OS, and is `.mjs` so it can import the build helper without the package typecheck.

Lives in `build/collect.mjs`, `test/windows-glob.test.mjs`.

## Breakpoint token equals Tailwind md

The mobile breakpoint token must stay equal to Tailwind v4's default `md` boundary so `useIsMobile()` and `md:` utilities share one edge.

Lives in `test/outputs.test.ts`.

## Elevation tiers

Every theme carries every elevation tier, because the Tailwind bridge has no fallback for a missing one. Inner sheens are a layer of the tier (DTCG `inset: true`), not a separate `.bg-dialog` rule, because a descendant rule at (0,2,0) outranks `.ht-shadow-dialog` (0,1,0) and replaces the whole box-shadow. The composer focus tier keeps the two light layers in dark too, because the old arbitrary `focus-within:shadow-[...]` value outranked its `dark:` variant and that is what shipped. Elevation is authored per mode, so a palette wears its mode's ladder.

Lives in `build/model.mjs` (shadow layer rendering), `build/css.mjs`, `test/outputs.test.ts`.

## WCAG floors for information colours

Colours that carry information (sender names in chat, file-type glyph tints, status hues as text, organization avatar initials, the link, the primary button label) are measured against the surfaces they are painted on, composited from the real tokens so a moved surface is re-measured. Body text owes 4.5:1, secondary `ink-muted` 3:1, and a status label on a pill owes the large-text floor because it is a short bold word. The `person.*` avatar fills measure about 3:1 as text, which is why `person.name-*` variants exist; status fills such as amber on white measure about 2:1, which is why the ink variants exist. A wash tints its backdrop toward the ink on it, so the densest wash on the most recessed row is the real floor. The dark primary button is a translucent frost, so its label is measured over both surfaces a button sits on (field pane and gutter). Organization avatars are a gradient between two stops, and an sRGB blend is never lighter than its lighter stop, so both stops clearing the floor covers every pixel. The surface ladder must bottom out on an opaque gutter or every ratio is meaningless.

Lives in `test/contrast.test.ts`, `build/palette-ladder.mjs`, `build/color.mjs`.

## Palettes are complete sets

A `[data-palette]` block overrides its mode's base block on the same element, so it must re-declare every variable that block declares, no more and no fewer. Mode (light or dark) decides which Houston set a palette derives from and which structure it wears; the palette decides the hexes. The library order is the picker's order: the two Houston sets, then imported light palettes, then dark ones; a vendored file whose `mode` disagrees with its group is a build error. Derived roles are re-measured from the generated CSS, not the build's own maths.

Lives in `test/palettes.test.ts`, `build/palette.mjs`, `build/omarchy.mjs`.

## Vendored Omarchy input

Palettes come from unmodified Omarchy `colors.toml` files in `vendor/omarchy/`. They are flat `key = "value"` lists, so a small reader replaces a TOML dependency; any other line shape and any malformed hex is a build error, which makes "every palette carries every hue" checkable. The two hues Omarchy treats as optional use Omarchy's own fallbacks (orange borrows yellow, brown is that orange halfway to black), which the `white` theme relies on.

Lives in `build/omarchy.mjs`.

## Authored families are inherited, never derived

Identity families (agent helmets and badge metal, file-type glyphs, person and organization avatars), the brand comet, one effect wash and the QR pair (a scanner needs dark modules on a light tile) are inherited from the Houston set of the same mode, unchanged. Status is semantics, not surface: a terminal palette's red, green and yellow are shell text colours, and in the `white` theme they are three grays, which would make a destructive pill look like a normal button. So status fills and the link are inherited from Houston; only roles worn as text step along the palette's ladder. A nudged role may drift at most 20 degrees of hue and must keep HSL saturation of at least 0.25 (every shipped role clears 0.29), because a near-gray has a defined hue and would pass a hue check alone. Inherited fills are pinned as exact colours.

Lives in `build/palette.mjs`, `build/palette-status.mjs`, `test/palettes.test.ts`.

## Status labels keep Houston's side

The label on an inherited status fill keeps the light or dark side Houston chose, so a destructive pill reads the same way in every palette. Within that side it takes the first palette tone that clears the label floor, then pure white or black. If the side cannot clear the floor it flips, because an unreadable label is worse than an inconsistent one, and the build prints a note. Houston's own light warning fill carries white at 2.1:1 by authored choice; an import may not, since it reaches that fill through a rule.

Lives in `build/palette-status.mjs`.

## Surface ladder keeps Houston's rhythm

The ladder (gutter, screen, field, card, popover, chip), lines and washes carry Houston's structure while hexes come from the palette. Washes are the palette foreground at alphas read off Houston's tokens. Houston light ships hover, chip-solid and field-hover as opaque grays (`#efefef` is ink at about 6% on white), so the light ladder uses the same 6% as an explicit mix to keep those tiers opaque. Omarchy's `lighter_background` steps toward a dark theme's direction, so in a light palette it is often darker (and `#c0c0c0` in `white`); when it is darker than the background the chip falls back to ink at 6%. Houston's light hairline is the blue-ink border wash `rgba(60, 70, 120, 0.1)`, not a gray. A resting card is the frosted screen's composited tone so cards read as the screen showing through the column tray.

Lives in `build/palette-surfaces.mjs`.

## Accent and primary button

An imported palette uses its accent as the action colour, focus ring and primary button; Houston's own sets keep an ink action by doctrine and never pass through this derivation. The label on the accent is measured, not assumed: the best of background, brightest ink, black and white, and a build error when none clears the body floor. In light the button is a solid accent pill, because a translucent fill on a light surface reads as disabled; in dark it is the frost pill tinted with the accent, starting its label at the brightest ink and stepping toward white until it clears the floor on both surfaces. The user's own chat bubble inverts in light and is a faint ink wash in dark.

Lives in `build/palette-text.mjs`, `build/palette-cta.mjs`.

## Swatch hexes

The picker paints a tile from four hexes and a pill from the fourth, so the fourth is the colour the real button wears: the accent for an import (which is `--ht-cta` in light and the frost tint in dark). Reading it from the action role sent a monochrome import such as `white` to Houston's blue link and showed a blue pill over a gray button. Houston's own sets show the link, the one place they spend colour on content. The swatch reads the accent from the vendored file so a substituted hue would be caught.

Lives in `build/palette.mjs`, `build/ts.mjs`, `test/palettes.test.ts`.
