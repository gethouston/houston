# @houston/design-tokens

One source of truth for Houston's design decisions — colour, typography scale,
spacing, radii, motion, elevation — authored once in
[W3C Design Tokens (DTCG)](https://www.w3.org/community/design-tokens/) JSON and
compiled to every surface: web/desktop CSS today, native SwiftUI (iOS) and
Jetpack Compose (Android) next. **A visual change is a token edit + rebuild; all
surfaces regenerate.**

## What a token is

A named design decision, decoupled from where it is used. `color.background`
means "the app background" — its concrete value (`#ffffff` light, `#1e1e1e`
dark) lives in one place, so a re-skin never means find-and-replace across
components.

## Two-tier model (primitive + semantic)

The standard two-layer structure:

1. **Primitives** (`tokens/primitive/*.json`) — the raw palette: `color.neutral.950`
   (`#0d0d0d`), `color.glass.white-68`, `color.status.danger`. Value-named, never
   referenced by UI directly. This is the only place a literal hex/rgba lives.
2. **Semantic** (`tokens/semantic/color.{light,dark}.json`) — role-named aliases
   that **reference** primitives: `ht.background -> {color.base.white}`,
   `ht.border -> {color.brand.border-wash}`. This is what the UI consumes. Light
   and dark are two files with the same token names and different references —
   mirroring how the app themes: an attribute swap (`[data-theme="dark"]`), set
   by `app/src/lib/theme.ts`.

Theme-independent **scales** (`tokens/scale/*.json`) — spacing, radius,
typography, motion, elevation — sit alongside and flow to the typed/native
outputs.

## Outputs (committed `dist/`)

Built by Style Dictionary v4 (`build/`), committed so consumers need no build step:

| File | Surface | Shape |
| --- | --- | --- |
| `dist/css/tokens.css` | web / desktop | `--ht-*` custom properties: light on `:root`, dark on `[data-theme="dark"]`. **The same variable names the app + `@houston-ai/*` already consume.** |
| `dist/ts/tokens.ts` | SDK / web JS | Typed `as const` objects: `color.{light,dark}`, `space`, `radius`, `fontSize`, `fontWeight`, `duration`, `durationMs`, `easing`, `shadow`. |
| `dist/swift/HoustonTokens.swift` | iOS (SwiftUI) | `HoustonThemedColor(light:dark:)` pairs resolved by the app's own `HoustonTheme`; `CGFloat` spacing/radii/sizes, `Font.Weight`, `TimeInterval` durations. |
| `dist/kotlin/HoustonTokens.kt` | Android (Compose) | `HoustonThemedColor(light, dark)` pairs; `Dp` spacing/radii, `TextUnit` sizes, `FontWeight`, `Long` duration millis, `CubicBezierEasing`. |

**Colours are theme pairs, resolved by the app's own theme state** (not the OS
appearance) on native, matching how web toggles `[data-theme]`. Swift uses
`Color(.sRGB, …)`, Kotlin `Color(red, green, blue, alpha)` — both carry alpha, so
translucent glass surfaces survive.

### How native pulls it in

The Swift/Kotlin files have no consumers in this repo yet. They are **copied or
code-generated into the iOS/Android app projects at their build time** (a future
step in those repos); this package only produces the artifact. They are written
to compile as-is against SwiftUI / Compose.

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

Because the legacy variable names were already consistent and semantic
(`--ht-sidebar-accent-fg`, etc.), **all 33 map 1:1** — no legacy aliases were
needed. The only string that changed is a cosmetic alpha normalization
(`rgba(255,255,255,0.10)` → `0.1`, an identical colour).

`test/legacy-resolved.json` pins the resolved value of every `--ht-*` variable as
it shipped pre-adoption (extracted from the old CSS, not hand-typed).
`test/zero-diff.test.ts` parses the generated CSS and asserts every token matches
that baseline **by parsed colour** (r,g,b,a), so a same-pixels reformat passes and
a real colour change fails.

## Adding or changing a token

1. Edit the JSON under `tokens/` — a primitive value, or a semantic reference.
   **Never edit `dist/`.**
2. `pnpm --filter @houston/design-tokens build`
3. Commit **source + regenerated `dist/`** together.
4. If the change is intentionally *visual* (a real colour move), update
   `test/legacy-resolved.json` to the new baseline in the same commit — otherwise
   the zero-diff test will (correctly) fail.

`test/sync.test.ts` rebuilds to a temp dir on every `pnpm test` and fails if the
committed `dist/` is stale — so you can never forget step 2/3.

## Consuming

- **Web/desktop**: nothing to import per-component. `@houston-ai/core`'s
  `globals.css` imports `@houston/design-tokens/css`; use the `--ht-*` vars or the
  Tailwind `--color-*` utilities as before.
- **JS values** (e.g. animation durations): `import { durationMs, easing } from "@houston/design-tokens"`.

## Not tokenized (yet, on purpose)

- **Brand glow palette** (blue/indigo/orange/amber of `card-running-glow` and the
  aurora) lives in component CSS (`ui/core/src/globals.css`,
  `app/src/styles/futuristic.css`). It drives animated *chrome*, not the
  `--ht-*` surface set; a future pass can promote it to primitives.
- **z-index** — the app uses a single systematic value (`-1` for the aurora); not
  a scale, so not tokenized.
- **Hardcoded literals** sprinkled in individual component CSS are out of scope —
  this package owns the central variable definitions. Migrating those to vars is
  incremental follow-up.
