# @houston/design-tokens

One source of truth for Houston's design decisions — colour, typography scale,
spacing, radii, motion, elevation — authored once in
[W3C Design Tokens (DTCG)](https://www.w3.org/community/design-tokens/) JSON and
compiled to CSS and TypeScript for web and desktop. **A visual change is a
token edit + rebuild; both outputs regenerate.**

## What a token is

A named design decision, decoupled from where it is used. `color.input`
means "the app background" — its concrete value (`#ffffff` light, `#1e1e1e`
dark) lives in one place, so a re-skin never means find-and-replace across
components.

## Two-tier model (primitive + semantic)

The standard two-layer structure:

1. **Primitives** (`tokens/primitive/*.json`) — the raw palette: `color.neutral.950`
   (`#0d0d0d`), `color.glass.white-68`, `color.status.danger`. Value-named, never
   referenced by UI directly. This is the only place a literal hex/rgba lives.
2. **Semantic** (`tokens/semantic/color.{light,dark}.json`,
   `tokens/semantic/elevation.{light,dark}.json`) — role-named aliases
   that **reference** primitives: `ht.input -> {color.base.white}`,
   `ht.line -> {color.brand.border-wash}`, and each elevation tier's layer
   colours (`shadow.card -> {color.alpha.black-a06}`). This is what the UI
   consumes. Light and dark are two files with the same token names and
   different references — mirroring how the app themes: an attribute swap
   (`[data-theme="dark"]`), set by `app/src/lib/theme.ts`.

Theme-independent **scales** (`tokens/scale/*.json`) — spacing, radius,
typography, motion, breakpoint — sit alongside and flow to the TypeScript
output.

**Elevation** compiles to `--ht-shadow-<tier>` (`edge` · `field` ·
`field-focus` · `card` · `raised` · `drag` · `dialog`) in all three CSS blocks,
bridged in `ui/core/src/globals.css` to Tailwind v4's `--shadow-*` namespace so
`shadow-card` is the utility and the token, not a `dark:` fork, carries the dark
value. A layer with `"inset": true` compiles to a CSS `inset` shadow, which is
how a tier holds an inner sheen as one of its own layers: a separate
`[data-theme="dark"]` sheen rule would replace the tier's whole `box-shadow`
instead of adding to it.

## The palette library (derived, not authored)

Mode and palette are two axes. `[data-theme]` is the resolved mode (light | dark);
`[data-palette="<id>"]` selects one of twelve colour sets. **Houston Light** and
**Houston Dark** are the two defaults and the authored token source above: they
emit no `[data-palette]` block because they ARE the `:root` / `[data-theme]`
blocks, byte-identical to what shipped before the library existed.

The other ten come from `vendor/omarchy/<theme>/colors.toml`, unmodified Omarchy
themes (MIT; provenance, licences and the refresh command live in
[`vendor/omarchy/README.md`](vendor/omarchy/README.md)). A `colors.toml` is 25
flat hues plus a `mode` line, read by `build/omarchy.mjs` (a minimal
`key = "value"` reader, no TOML dependency; a line of any other shape is a build
error). The `white` theme omits `orange` and `brown`, so Omarchy's own fallbacks
apply: `orange` borrows `yellow`, `brown` is that orange halfway to black. Any
other missing hue fails the build.

25 hues are a terminal's vocabulary, so every palette is **derived** into the
complete `--ht-*` role set by one table of rules:

- `build/palette.mjs` merges the halves and holds the inheritance rule: the
  authored families (`glow.*`, `agent.*`, `filetype.*`, `person.*`, `flash` and
  every elevation tier) come from the Houston set of the same mode, unchanged. A
  role that is neither authored nor derived is a build error, so a new token
  cannot silently keep a Houston hex inside someone else's scheme.
- `build/palette-surfaces.mjs` keeps Houston's ladder structure and alpha washes
  with the palette's hexes.
- `build/palette-text.mjs` derives ink, the status hues, the action colour and
  the focus ring (`action` and `focus` are the palette's own accent, with
  `action-text` measured on it at 4.5:1 or the build fails), and the contrast
  nudging: the six roles worn AS TEXT step toward the palette's own ink in 2%
  mixes until they clear 4.5:1 (3:1 for `ink-muted`) on the field, the screen, the
  recessed row and, for a status ink, its own wash.
- `build/palette-cta.mjs` derives the filled primary button in the grammar of the
  palette's mode: a solid accent pill in light, wearing the same measured label as
  `action-text`, and Houston dark's frost pill tinted with the accent in dark,
  whose label steps from the palette's bright foreground toward white until it
  clears 4.5:1 on that pill over the field and over the gutter.

The build prints one note per fallback and per nudge it applies. The full role →
formula table, the two named rules (the dark screen-tone card, the light chip
fallback), why a pinned `[data-theme="light"]` subtree resolves the HOUSTON light
set, and how to add a palette are in
[`docs/adr/0004-palette-library.md`](../../docs/adr/0004-palette-library.md).

`test/palettes.test.ts` asserts that every palette block declares exactly its
mode's base variable set, that every value parses, and that every floor still
holds, measured from the generated CSS for all ten imports.

## Outputs (`dist/`, a build artifact)

Built by Style Dictionary v4 (`build/`). **`dist/` is gitignored and never
committed** — the build regenerates it locally and in CI, and this package's own
build runs ahead of the packages that consume it, so a fresh checkout produces it
before anything imports it:

| File | Surface | Shape |
| --- | --- | --- |
| `dist/css/tokens.css` | web / desktop | `--ht-*` custom properties (colour + elevation): light on `:root`, dark on `[data-theme="dark"]`, then one full set per imported palette on `[data-palette="<id>"]`. **The same variable names the app + `@houston-ai/*` already consume.** |
| `dist/ts/tokens.ts` | SDK / web JS | Typed `as const` objects: `color.{light,dark}`, `shadow.{light,dark}` (box-shadow strings per tier), `palettes` + `PaletteId` (the picker's library, each with four resolved swatch hexes), `space`, `radius`, `fontSize`, `fontWeight`, `duration`, `durationMs`, `easing`. |

## The zero-diff story (web/desktop adoption)

Adopting the generated CSS produced **zero visual change** — this was a refactor
of *where values live*, not a redesign.

Before: the `--ht-*` variables were hand-written in **two** places —
`ui/core/src/globals.css` (base) and `app/src/styles/futuristic.css` (the
"futuristic" theme, imported last, overriding ~11 of them per mode). The
*resolved* value of each variable was the futuristic override where present, else
the base.

Now: `dist/css/tokens.css` defines each `--ht-*` **once**, at its resolved value,
and both files import it (`@houston-ai/core` imports the tokens; `@theme` there
still re-exports `--ht-*` to Tailwind's `--color-*`). The futuristic layer keeps
only its *effects* (aurora glow, glass blur, canvas layout) — the surface colour
values moved into the token source.

Because the variable names were already consistent and semantic
(`--ht-sidebar-hover-text`, etc.), **all 33 map 1:1** — no legacy aliases were
needed. (That statement is about the ORIGINAL CSS adoption; the names shown here
are the CURRENT ones, after the July 2026 rename below.) The only string that
changed in that adoption is a cosmetic alpha normalization
(`rgba(255,255,255,0.10)` → `0.1`, an identical colour).

**July 2026 — owner-vocabulary rename.** The semantic set was later renamed 1:1 to
names the owner can speak as Tailwind utilities (`background` → `input`,
`foreground` → `ink`, `primary` → `action`, `accent` → `hover`, `secondary` →
`chip`, `border` → `line`, `destructive` → `danger`, and so on — the full set
lives in `tokens/*.json`). Every resolved value is
byte-identical; only the names moved. `test/legacy-resolved.json` keys carry the
NEW names while pinning the SAME resolved colours, so the same `zero-diff.test.ts`
that proved CSS adoption moved zero pixels now also proves the rename moved zero
pixels.

`test/legacy-resolved.json` pins the resolved value of every `--ht-*` COLOUR
variable as it shipped pre-adoption (extracted from the old CSS, not
hand-typed); elevation is not a colour and has no such baseline, so
`--ht-shadow-*` is skipped.

Two entries in that fixture are **deliberate moves off the pre-adoption
baseline**, pinned at their new values (its `$note` says the same):

- Dark `card-solid` and `tab-active` are retuned to `#1e1e20`, the frosted
  screen's own composited tone, so a board card reads as the screen showing
  through its column tray instead of a slab laid on it.
- The `-ink` status hues (`success-ink`, `warning-ink`, `danger-ink`) are new
  tokens with no pre-adoption ancestor: the status FILLS are tuned to carry a
  white or black label and measure 3.4:1 (success) and 2.1:1 (warning) as text
  on the light canvas, so the hue set as TEXT is its own token, guarded by
  `test/contrast.test.ts`.

Every other entry pins a pre-adoption value.
`test/zero-diff.test.ts` parses the generated CSS and asserts every token matches
that baseline **by parsed colour** (r,g,b,a), so a same-pixels reformat passes and
a real colour change fails.

## Adding or changing a token

1. Edit the JSON under `tokens/` — a primitive value, or a semantic reference.
   **Never edit `dist/`.**
2. `pnpm --filter @houston/design-tokens build`
3. Commit the **token source** only — `dist/` is gitignored, so there is nothing
   generated to commit; the build regenerates it, and a fresh checkout builds it
   before use.
4. If the change is intentionally *visual* (a real colour move), update
   `test/legacy-resolved.json` (a committed fixture, not part of `dist/`) to the
   new baseline in the same commit — otherwise the zero-diff test will (correctly)
   fail.

`test/sync.test.ts` rebuilds to a temp dir on every `pnpm test` and diffs it
against the `dist/` already on disk, failing if your built `dist/` is stale
relative to the token source — so a token edit without a rebuild is caught. It
validates the freshly built output, not a committed copy (`dist/` is gitignored);
the fix it prints is step 2, rebuild.

## Consuming

- **Web/desktop**: nothing to import per-component. `@houston-ai/core`'s
  `globals.css` imports `@houston/design-tokens/css`; use the `--ht-*` vars or the
  Tailwind `--color-*` utilities as before.
- **JS values** (e.g. animation durations): `import { durationMs, easing } from "@houston/design-tokens"`.

## Not tokenized (yet, on purpose)

- **The aurora** (the dark-mode radial glow in `ui/core/src/canvas.css`) keeps
  its authored rgba layers: it is an effect, not a surface role. The running
  comet it shares hues with IS tokenized (`ht.glow.*`, theme-invariant).
- **z-index** — the app uses a single systematic value (`-1` for the aurora); not
  a scale, so not tokenized.
- **Hardcoded literals** sprinkled in individual component CSS are out of scope —
  this package owns the central variable definitions. Migrating those to vars is
  incremental follow-up.
