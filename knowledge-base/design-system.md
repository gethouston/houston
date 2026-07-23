# Design System

Visual language: ChatGPT-like. Near-black primary, monochrome, clean typography, minimal chrome.

> **⚠️ Updated — the desktop app now ships the "futuristic" theme**, a deliberate
> brand-direction refactor layered into `app/src/styles/futuristic.css` (imported
> last so its token overrides win). It intentionally overrides much of the
> monochrome guidance below: an aurora glow + glass surfaces in **dark**, a cool
> solid "Aurora" palette in **light**, an Arc/Zen "canvas" layout, and a seamless
> macOS overlay title bar. See **Futuristic theme** at the bottom of this doc. The
> grayscale / "never decorative colour" / "light mode only" notes below are kept
> for history, but the futuristic layer is the current source of truth.

## Design tokens are the source of truth

Colour, typography scale, spacing, radii, motion and elevation are defined ONCE
in **`packages/design-tokens`** (`@houston/design-tokens`), authored as W3C DTCG
JSON (primitive layer + semantic `--ht-*` alias layer, light + dark) and compiled
by Style Dictionary to every surface. The CSS emits the light values on **both
`:root` and `[data-theme="light"]`** (and dark on `[data-theme="dark"]`), so any
subtree can **pin either palette regardless of the app theme** by setting
`data-theme` on a wrapper — custom properties inherit, so the scoped
re-declaration re-resolves every `var(--ht-*)`, and thus every Tailwind
`--color-*` utility, inside it (the whole first-run flow pins
`data-theme="light"` this way, so a dark-mode user still gets a light
first-run). The `dark` Tailwind
variant (`ui/core/src/globals.css`) and every `[data-theme="dark"]` descendant
rule (`futuristic.css`, app `globals.css`) carry a
`:not(:where([data-theme="light"], [data-theme="light"] *))` guard so dark
chrome never leaks into a pinned subtree through the `<html>` ancestor — keep
the guard on any new dark-scoped descendant rule. Outputs:
`dist/css/tokens.css` (web/desktop),
`dist/ts/tokens.ts` (JS values), `dist/swift/*.swift` + `dist/kotlin/*.kt`
(native, no consumers yet). `@houston-ai/core`'s `globals.css` imports the CSS;
`@theme` there re-exports `--ht-*` to Tailwind `--color-*` as before.

**Change procedure — a visual change is a token edit** (this is procedure b of
the client-architecture contract — see `knowledge-base/client-architecture.md`
for how visual, behavior, and structural changes flow across all three surfaces):


1. Edit `packages/design-tokens/tokens/*.json` (a primitive value or a semantic
   reference). NEVER edit `dist/` and NEVER add a new hardcoded colour/spacing
   literal to app or `ui/` CSS — reference a `--ht-*` var (or a Tailwind
   `--color-*` utility).
2. `pnpm --filter @houston/design-tokens build`. `dist/` is gitignored (not
   committed, on this repo despite older guidance to the contrary) — the build
   step regenerates it locally/in CI, so only commit the `tokens/*.json` source.
3. If the change is genuinely visual, update `test/legacy-resolved.json` to the
   new baseline in the same commit (the zero-diff test pins it otherwise).

The colour values below are the CURRENT shipped tokens; treat the JSON as
authoritative. See `packages/design-tokens/README.md` for the two-tier model and
the zero-diff story.

## Personality
Capable, calm, invisible. Quiet expert. Not flashy, not corporate, not techy. Like texting brilliant assistant.

**Anti-references:** Jira, Linear, Notion. No dense toolbars. No keyboard-shortcut culture. No config overload.

## Principles
1. **Show, don't configure.** One obvious action per screen. No settings panels. Infer if possible.
2. **Always feel alive.** AI working → user sees movement every second. Silence = broken.
3. **Chat is interface.** Primary interaction. Everything else supports.
4. **Non-technical labels.** "Prompt" not "Description". "Needs You" not "In Review". Mom-test every word.
5. **Invisible borders, visible actions.** Borders 5-15% opacity. Action buttons (Start/Approve/Delete) always visible — never hover-only.

## Color
Near-black `#0d0d0d`, NEVER pure black. **Both light and dark ship** now (the
"light mode only" era is over — see Futuristic theme).

### Grays
`gray-50 #f9f9f9` (sidebar bg) · `100 #ececec` (hover, user bubble) · `200 #e3e3e3` (pressed, dividers) · `300 #cdcdcd` (borders) · `400 #b4b4b4` (disabled) · `500 #9b9b9b` (placeholder) · `600 #676767` (secondary text) · `700 #424242` (body) · `950 #0d0d0d` (primary text + buttons)

### Tokens
The semantic `--ht-*` set (re-exported to Tailwind `--color-*`) is generated from
`@houston/design-tokens` — see `tokens/semantic/color.{light,dark}.json` for the
live values (each token carries its own light AND dark value; dark glass keeps
its transparency inside the value).

The owner vocabulary (say these words to direct changes):
- **Grounds**: `base` (the app frame the sidebar sits on) → `background` (the
  main pane, light `#fcfcfc`) → `input` (the white `#fff` surface — fields,
  composer, floating cards).
- **Elevated**: `card` / `card-hover` (glass) / `card-solid` (solid board card)
  / `popover` / `dialog` (both SOLID — floating surfaces never bleed).
- **Text**: `ink`, `ink-muted` (+ per-surface `card-text`, `popover-text`).
- **Interactive**: `action`/`action-text` (filled CTA), `hover` (row/menu hover
  fill, light `#efefef`), `chip`/`chip-text` + `chip-subtle` (soft fills).
- **Lines & focus**: `line` (hairlines), `line-input` (field borders), `focus`.
- **Status**: `danger`, `success`, `warning`, `highlight` (each with `-text`).
- Untouched families: `space-*` (the workspace-loading splash + OrbitLoader),
  `agent.*` (avatar palette),
  `sidebar*` (with `-text`/`-hover`/`-line`/`-active` suffixes; `sidebar-active`
  is the selected-row fill, a clear step above hover in both themes).

### `--ht-space-*` (workspace-loading splash)
A deliberately **theme-invariant** group — both `color.light.json` and
`color.dark.json` alias the same `color.space.*` primitives, so the space
backdrop reads identically in light and dark. It now backs ONLY the
**workspace-loading splash** (`shell/workspace-loading.tsx`) and the
`OrbitLoader` / `SuccessCheck` it hosts — the first-run gates, sign-in,
onboarding, and the cloud-migration wizard moved OFF the space photo to a flat
light page (see Animation → First-run flow). Feeds the shared
`SpaceScreen` backdrop (see Animation → Space screen backdrop): `--ht-space-canvas`
`#07080f` (near-black indigo base + the photo scrim's only colour, via
`color-mix`) · `-canvas-glow` `#101430` (decode-gradient top) ·
`-nebula-1` `#38346b` / `-nebula-core` `#b8b2e8` / `-star-warm` `#f6e7cd` —
the `SuccessCheck` celebratory gradient · `-star` `#dce2f7` (OrbitLoader ring
+ comet tail) · `-foreground` `#ffffff` (the splash wordmark + loader,
currentColor) · `-foreground-muted` `#8e96b8` (splash status line).
The `OrbitLoader` rocket + comet trail reuse `-foreground` (pure white, head)
and `-star` (cool white, tail) — no dedicated comet tokens. (`-nebula-2`,
`-nebula-dust`, `-haze` were deleted with the procedural nebula/starfield —
see Animation → Space screen backdrop.) The **migration progress screen**
reuses the same `OrbitLoader` but remaps `-foreground`/`-star` to
`--ht-ink`/`--ht-ink-muted` via an inline wrapper (`ORBIT_INK_VARS`), so the
rocket reads as dark-on-light there without a component change.
**Deleted:** `--ht-space-glass` / `-glass-border` / `-glass-light` (the old
white-glass card material for cards floating on the photo). The first-run
flow is flat light with plain white cards now, so nothing floats on the photo
— the `glass.space-75` + `glass.white-92` primitives went with them.

### Borders (opacity)
5%/15%/15%/25% = light/medium/heavy/xheavy. Use `rgba(13,13,13,X)`.

### Status
success `#00a240` · info `#0169cc` · warning `#e0ac00` · danger `#e02e2a`

### Color restraint
The monochrome discipline still holds for *content* (text, controls), but the
futuristic theme adds intentional **ambient brand colour** as chrome:
1. card-running-glow gradient (blue→indigo→orange→yellow) — the brand palette
2. the **aurora glow** behind dark mode (same blue/indigo/orange family)
3. the cool **Aurora** light palette (blue/indigo-tinted gutter + cards)
4. status indicators, agent/channel avatars, links

"Never decorative colour" is now scoped to *content surfaces*; the **chrome**
(window background, glass, glow) carries brand colour deliberately.

### Agent avatars
Use `HoustonAvatar` from `@houston-ai/core` for agent avatar badges. Resting
state = no border, gray background softly mixed with the agent color, colored
helmet glyph. Running state = same badge inside the comet glow. Resolve stored
semantic ids with `resolveAgentColor` from `@houston-ai/core`, not app-local
helpers, so desktop and mobile render same palette.

## Brand theming
Override `--color-action` via globals.css. NEVER hardcode hex — always semantic token.

## Typography
System font stack. No webfonts.

| Element | Size | Weight | Tailwind |
|---------|------|--------|----------|
| h1 | 28px | 400 | `text-[28px]` |
| model selector | 18px | 400 | `text-lg` |
| body/input | 16px | 400 | `text-base` |
| buttons | 14px | 500 | `text-sm font-medium` |
| sidebar items | 14px | 400 | `text-sm` |
| small labels | 12px | 400 | `text-xs` |

Section headers: sentence case, never uppercase/tracking-wider. `text-sm font-medium`.

## Buttons
Pill shape (`rounded-full`) everywhere.

- **Primary:** `bg-gray-950 text-white rounded-full h-9 px-3 text-sm font-medium hover:bg-gray-800`
- **Secondary:** `bg-white text-gray-950 rounded-full h-9 px-3 border border-black/15 hover:bg-gray-50`
- **Ghost:** `bg-transparent rounded-lg w-9 h-9 hover:bg-[#f3f3f3]`
- **Soft chip:** `bg-gray-100 rounded-full h-9 px-3 hover:bg-gray-200`
- **Large:** `h-11 px-4`

## Composer (signature)
`max-w-3xl rounded-[28px] bg-white p-2.5` + multi-shadow:
```
0 4px 4px rgba(0,0,0,0.04),
0 4px 80px 8px rgba(0,0,0,0.04),
0 0 1px rgba(0,0,0,0.62)
```
Grid: leading (attach) | primary (text) | trailing (send).

## Messages
- **User:** `ml-auto max-w-[70%] rounded-3xl bg-[#f4f4f4] px-5 py-2.5`
- **Assistant:** no bubble. Plain markdown, left-aligned, transparent.

## Cards
White bg, `border-black/5`, `rounded-xl`, hover shadow. Running state = `card-running-glow` animation border.

### RowCard (inline notice + integration cards)
One shared component (`app/src/components/cards/row-card.tsx`) for the compact horizontal cards in chat and integration surfaces: monochrome logo/icon left (`size-8 rounded-lg` media box), `text-[13px]` title + `text-[11px]` muted description, single right-side action slot. Always grey `bg-chip`, `rounded-xl`, `px-3 py-2.5`. The `inline` prop renders a `<span>` row so it can sit inside assistant markdown prose; `size="md"` gives a roomier modal-heading variant. Pair with `RowCardButton` (`h-7 rounded-full` pill) — its `icon` is **optional**, so action buttons are text-only by default (only the Composio cards pass a trailing link icon), and it is built on `AsyncButton` (HOU-465 rage-click guard). The media slot takes either a `ProviderGlyph` (`shell/provider-logos.tsx`) — monochrome, never full-color brand marks, keyed by provider id with an initial fallback — or a lucide icon. Used by: reconnect / sign-in (`UnauthenticatedCard`, `ProviderReconnectCard`), rate-limit (`RateLimitedCard`, clock icon), the provider-switch dialog, and the inline Composio `#houston_toolkit` link card. **Not** the interaction-card stepper's connect/signin STEPS — those compose the shared `InteractionModal` shell (`ui/chat`, reference "Coworker card" look, inventory v19): the `(icon) name` identity lockup (brand logo `sm` beside the integration NAME at REGULAR weight, via `InteractionModalTitle`) is the modal HEADER title, on the same row as the pager + dismiss X; the body is TWO fields (the agent's reason in foreground tone, then the app description / sign-in explainer muted); the FOOTER is the unified "Not now" + Esc hint beside a filled CTA with a return-key glyph. Weight is restrained: color tone carries the hierarchy, so the title and labels are regular — `font-medium` survives only on the Recommended chip, the number badge, and the CTA label; no competing bolds. "Not now" travels WITH the CTA (present wherever the CTA is, including a reconsidered skip). The signin/connect body renders its OWN `InteractionModal` wired with the stepper's `StepChrome` (pager + dismiss), so ui/chat stays auth/Composio-unaware. See `chat-connect-interaction-card.tsx` / `chat-signin-interaction-card.tsx`.

> **AI Models hub is the one deliberate exception.** The hub (Providers/Models tabs) reaches for a full-color brand mark — `BrandMark` (`app/src/components/ai-hub/brand-mark.tsx`) renders the same `ProviderGlyph` boxless (no tile or wash), full-bleed at sm/md/lg (`size-6/8/10`), colored via the sanctioned hex map in `shell/provider-brand-colors.ts` (the ONLY place raw brand hex may live; every other surface stays on tokens). This is a "candy store" recognition device scoped to the hub — chat surfaces (RowCard, provider-switch, error/reconnect cards) stay monochrome. Multi-button error cards stay on `ErrorCard` (icon-bubble) in `provider-error-cards/shared.tsx`.

## Empty states
`Empty` from `@houston-ai/core`. Big `text-2xl font-semibold` title + description + optional action. No icon-in-box. Container must be `flex flex-col` for `flex-1 justify-center`.

## Progress panel
`ProgressPanel` from `@houston-ai/chat`. Agent calls `update_progress({steps})`. States: pending (empty circle) / active (spinner + highlight) / done (green check). Header: "X of Y steps complete". Renders right-side alongside ChatPanel.

## Layout

```
+----------+---------------+-------------+
| Sidebar  | Tab Bar       | Right Panel |
| 200px    |---------------| (optional)  |
|          | Main Content  |             |
+----------+---------------+-------------+
```

Sidebar 200px `#f5f5f5`. Right panel 45% width, 380px min. Split view resizable, default 55/45. Chat max-width 768px (`max-w-3xl`). Header 52px.

### Radii
`rounded` (0.25rem chips) · `rounded-md` (inputs) · `rounded-lg` (sidebar items, icon btns) · `rounded-xl` (cards) · `rounded-2xl` (large cards, dialogs) · `rounded-[28px]` (composer) · `rounded-full` (pills, avatars)

### Button sizes
`h-9` standard · `h-11` large · `w-9 h-9` icon

## Shadows
Composer shadow = main depth cue. Else flat or 1px edge: `0 1px 0 rgba(0,0,0,0.05)`.

## Animation
- **card-running-glow** — rotating conic-gradient border. blue→indigo→orange→yellow. 2.5s infinite. Comet tail.
- **Framer Motion (Board):** enter `opacity:0, y:8` → `opacity:1, y:0`. Exit `y:-8`. Duration 0.2s, easing `[0.25, 0.1, 0.25, 1]`. `AnimatePresence` with `popLayout`.
- **Spring preferred:** `{type:"spring", stiffness:300, damping:30, mass:1}`.
- **typing-bounce** — 3-dot indicator, vertical translate + opacity.
- **tool-pulse** — pulsing dot, 1s, active tool calls.

Duration: fast 0.2s / common 0.667s / bounce 0.833s / elegant 0.582s. Under 0.3s for interactions.

Rules: `layout` prop on reordering items. `AnimatePresence mode="popLayout"` for lists. Spring > CSS easing.

### First-run flow (flat light, `FirstRunScreen`)
The language + disclaimer gates, **sign-in**, **onboarding**, and the
**cloud-migration wizard** all render on **`FirstRunScreen`**
(`components/onboarding/first-run-screen.tsx`): a flat, calm full-screen page in
the app's light-mode gutter grey (`bg-gutter` — the tone the sidebar melts into)
under plain **white cards**. It pins `data-theme="light"`, so a dark-mode user
still gets a bright light first-run (that decision stands) and every `--ht-*`
token inside resolves light. **No space photo, no glass, no `backdrop-blur`** —
the space/galaxy look is OUT for first-run.
- **Cards** are the shared `SetupCard` (`components/onboarding/setup-card.tsx`):
  a `bg-card` white card + `border-line` hairline + soft shadow. There is no
  `onSpace` prop and no glass remap any more — `SPACE_CARD_VARS` and the
  `--ht-space-glass*` tokens were deleted.
- **Sign-in** (`auth/sign-in-screen.tsx`) is a white card with the filled
  `bg-action` value panel; ink is normal `text-ink` (the last-sign-in hint on
  `text-ink-muted`, the provider halo on `--ht-focus`, both retuned for white).
- **Language gate** (`shell/language-gate.tsx`) offers each language as a plain
  gray `Button` (`variant="secondary"`, none pre-selected — the OS locale only
  picks the copy language) and a single click applies + advances (no separate
  Continue). The sign-in provider pills are the same gray secondary; the email
  submit is the card's single filled action.
- The **cloud-migration wizard** (`components/onboarding/cloud-migration/`): the
  OFFER is a PR-1003-style split card (`offer-screen.tsx` + `offer-pitch.tsx` —
  820px elevated white card, astro side image with seam-blend gradient,
  "What you get" icon tiles, full-width pill CTA); progress/congrats keep
  `WizardFrame` (card-less hero, ink copy, no veil)
  and `SetupCard`s for the done-steps; `MigrationProgressBar` (normal `bg-chip`
  track + `bg-action` fill), `SpaceInvaders` (paints `text-ink`), the status
  cycle, and `WizardBadge` (the `onPhoto` variant was removed) all render on
  light tokens. The progress `OrbitLoader` is remapped to ink (`ORBIT_INK_VARS`,
  see `--ht-space-*` above). The done congrats keeps the one colour accent, the
  `SuccessCheck`.
- **Gotcha RESOLVED (2026-07): `text-base` is a plain font-size utility
  again.** The gutter token's Tailwind alias was renamed `--color-base` →
  `--color-gutter` (`ui/core/src/globals.css`) precisely because a colour
  named `base` made Tailwind also emit `text-base` as a COLOUR utility —
  any `text-base` heading without its own colour class rendered
  background-coloured (invisible on a matching surface, both themes; the
  forced-update dialog title was the casualty that exposed it). Never
  reintroduce a colour token named `base`.

### Space screen backdrop (boot gate states)
`SpaceScreen` (`app/src/components/space/space-screen.tsx`) is the **shared
full-screen space layout**: the `--ht-space-canvas` base, the `SpaceBackground`
backdrop (the landing page's Milky Way photograph under its readability scrim),
and a `z-10` content slot on top. Its consumers are the **workspace-loading
splash** (`components/shell/workspace-loading.tsx`) and the **storage-unavailable
gate** (`components/auth/storage-unavailable-screen.tsx`) — content sits
directly on the dark backdrop, using the space-foreground token family
(`--ht-space-foreground` / `-foreground-muted`). The canvas is theme-invariant
DARK while `action` follows the app theme, so any themed control placed on it
(e.g. the storage gate's Retry `Button`) must pin `data-theme="dark"` on its
subtree or it turns near-black-on-black in light mode.
The whole space rendering cluster lives in **`app/src/components/space/`**.

**`OrbitLoader`** (`space/orbit-loader.tsx` + geometry/trail constants in
`space/orbit-path.ts`) is the loading centrepiece that replaced the old scaled-up
`HoustonAvatar running` card: a 240px inline-SVG scene — a soft pulsing core
(the workspace being assembled), a barely-there tilted elliptical orbit ring
(`--ht-space-star` @ 0.16), and a rocket ship (a single closed compound `<path>`:
ogive nose cone, cylindrical body, swept tail fins, tapered engine base) travelling
the ellipse via SMIL `<animateMotion rotate="auto">` (6s lap, unhurried; the path
points nose-first along +x). The comet streak is 12 soft blurred capsule ellipses
riding the SAME `<mpath>` path with negative `begin` offsets + decreasing
opacity/scale, so they overlap into one continuous glowing streak rather than
reading as discrete blobs. All white: it fades mainly via opacity, with a subtle
tone shift from `--ht-space-foreground` (pure white, head) to `--ht-space-star`
(cool white, tail) for depth — no amber/blue, no colour literals. No JS loop, no
per-frame allocation. SMIL ignores `prefers-reduced-motion`, so it
branches on framer-motion `useReducedMotion()` → a single static ship parked on
the ring beside the static core, zero `<animate*>` elements.

`SpaceBackground` (`app/src/components/space/space-background.tsx`) is the
space layer itself — an `aria-hidden`, `pointer-events-none` absolute layer.
It is **the landing page's Milky Way photograph** (ESO panorama eso0932a,
ESO/S. Brunier, CC BY 4.0), the SAME assets the website uses
(`app/src/assets/space/milkyway-*.{avif,webp,jpg}`, copied from
`website/src/assets/space/`), so the marketing site and the app's first-run
experience read as one scene. Three stacked sublayers:

**(1) Base gradient** — a near-black indigo `linear-gradient` (canvas-glow →
canvas), always painted so nothing flashes while the photo decodes.

**(2) The photograph** — a `<picture>` with AVIF/WebP/JPEG srcsets at
1280/1920/2560 widths, `object-cover`, framed at the landing page's
`center 42%` so the galactic core sits in the upper third behind the card.
Fades in over 700ms on decode (`motion-reduce:transition-none`).

**(3) Scrim** — the landing readability veil ported 1:1 (gradient stops a
touch stronger through the middle, 0.5 vs the landing's 0.4, because the app
centers text over the galactic core): a radial vignette + 180° gradient whose
only colour is `--ht-space-canvas` via `color-mix`, plus the same near-invisible
SVG fractal-noise film (0.025 alpha) against banding on the dark ramps.

**History:** this replaced the procedural WebGL-nebula + canvas-starfield
system (`nebula-gl/shader/noise/program`, `starfield/-model/-sprites` — deleted;
in git history if ever needed). The `--ht-space-nebula-2` / `-nebula-dust` /
`-haze` tokens went with it. Restraint over spectacle — it is a backdrop,
never the show.

## Icons
Lucide React only. 20px standard (`h-5 w-5`), 16px small, 24px large. Stroke 2px (or 1.5px lighter). `currentColor`.

**No emoji as icons.**

## Rules
1. No emoji icons
2. No hover-only affordances
3. Monochrome *content*; brand-coloured *chrome* (futuristic theme)
4. Compact not cramped
5. Animations serve purpose
6. Pill shapes for buttons (`rounded-full`)
7. Brand via tokens only — never hardcode hex

## Design skill workflow
1. `/critique` — before building
2. `/polish` — final alignment/spacing/consistency pass
Use when relevant: `/clarify` (UX copy), `/distill` (overloaded screen), `/animate` (micro-interactions), `/audit` (a11y, perf).

## Futuristic theme

The current desktop look. One revert-able layer, `app/src/styles/futuristic.css`
(delete its `@import` in `app/src/styles/globals.css` to fully revert), plus a
few targeted component/token changes. Surface colours route through `--ht-*`
tokens, re-exported to Tailwind as `--color-*`, so the theme is mostly token
overrides — not a 20-component rewrite.

**Arc / Zen "canvas" layout.** The main content floats as a rounded "screen"
card (the `background` token; the `.canvas-screen` CSS class) on a recessed **window gutter** (`base`); the sidebar is
transparent and melts into the gutter. Tokens: `--ht-layer-0` (window bg)
and `--ht-layer-1` (the floating screen). The mission panel opens as a
second rounded card with a gutter gap.

**The canvas is the standard main surface — a light gray, not white (light
mode).** `--ht-layer-1` is the tone every content pane (board, chat,
routines, integrations, files, settings, AI hub, agent settings…) sits on. In
**light** it is `#fbfbfb` — the flattened equivalent of the chat panel's former
`bg-chip-subtle/50` over white, promoted to the ONE standard so white cards, the
composer, inputs, and popovers **float** on a calm gray rather than vanishing
into white-on-white. In **dark** it is unchanged (`{color.glass.screen-55}`
frosted glass); the light change never moves dark. It is exposed to Tailwind as
**`bg-layer-1`** (`--color-layer-1 → --ht-layer-1`, `ui/core/src/globals.css`
`@theme`) so any surface that lives ON the canvas can reference the SAME tone as
one source of truth — e.g. the chat panel (`ui/chat/chat-panel.tsx`) is
`bg-layer-1 dark:bg-transparent` (transparent in dark to let the pane's glass
through). The two shell panes (`shell/workspace-shell.tsx`) get it via the
`.canvas-screen` class, which ALSO carries the dark frosted-glass blur — so they
keep the class (never swap it for a bare `bg-layer-1`, which would drop the dark
glass); the light-gray flip is purely the token value change.

**the surface ladder (light mode):**
- **`bg-layer-1`** (`#fbfbfb`) — the main pane / standard surface things float
  ON. Use for a content-area background that should read as the calm base.
- **`bg-card`** (`white-68` glass ≈ near-white over canvas) — a card/panel that
  should **float above** the canvas (mission cards, settings group cards). White
  + border + sheen is what makes it lift off the gray.
- **`bg-layer-2`** (`#fff`) — the opaque-white fallback / floating inputs &
  the composer (white pills that float on the canvas). NOT for pane backgrounds
  in the futuristic layout (a pane painted `bg-layer-2` becomes a white slab
  on the gray canvas — the `.canvas-screen` panes keep `bg-background` only as
  the theme-off fallback, overridden by the class).
- **`bg-chip` / `bg-chip-subtle`** (`ink-a035`, subtle darker-than-canvas) —
  recessed panels that sit BELOW the card tier (board columns, provider rows).

**Dark mode** — the signature look: a multi-radial **aurora glow** on
`body::before` (blue/indigo/orange, slow 32s drift, disabled under
`prefers-reduced-motion`) + translucent **glass** surfaces (`.bg-card`,
sidebar) with `backdrop-filter` blur. FLOATING surfaces (`popover`, `dialog`)
are NOT glass — they are solid in both themes (see "Modals" below).

**Light mode** — the cool, solid **"Aurora" palette** (no glow mesh — it read as
"glitter" over solid surfaces): gutter `#eef1f7`, screen `#fbfbfb` (the standard
light-gray canvas — see "The canvas is the standard main surface" above), cards
`#f4f6fc`, cool blue/indigo border. Clean and futuristic by restraint, not
decoration.

**Modals and popovers: SOLID in both themes.** All modal primitives —
`DialogContent` (`ui/core/components/dialog.tsx`), `AlertDialogContent`,
`SheetContent`, and the AI-Hub `ModalShell` — render on the dedicated
**`bg-dialog`** surface token; menus/popovers on **`bg-popover`**. Both tokens
are OPAQUE: white in light, `{color.neutral.800}` (#1e1e1e) in dark. They were
glass once, but a floating surface that sits over content must never bleed it
through: the glass fills read as solid only via `backdrop-filter`, which
WebView2 does not reliably composite (GPU/driver dependent, silently no-ops),
so desktop modals painted see-through — solid tokens fix it everywhere, web
included, with no per-platform fallback. Never re-add alpha to these tokens or
put an opacity modifier (`bg-popover/95`) or `backdrop-blur` on a floating
surface. The token is separate from `card` on purpose: `card` stays glass for
NON-floating surfaces (cards over the canvas). Wired: `dialog`/`popover` in
`tokens/semantic/color.{light,dark}.json` → `--ht-dialog`/`--ht-popover` →
`@theme` (`ui/core/src/globals.css`) → Tailwind `bg-dialog`/`bg-popover`; the
top-sheen rules stay in `futuristic.css`. The scrims are deliberately light:
Dialog overlay `bg-black/25`, Alert/Sheet `bg-black/35`. Change the surface
centrally in those primitives — no modal should hardcode its own background.

**Scroll-stuck pinned controls** — a bar that pins to the top of its scroll
container (a catalog's search + filters row, a provider grid's filter bar) sits
`sticky top-0 z-20` and is TRANSPARENT at rest, fading in the opaque `bg-popover`
fill + a `rounded-b-2xl` bottom ONLY once rows scroll BEHIND it. The stuck state
is detected by the generic **`useStuckOnScroll`** hook — ONE source of truth in
`@houston-ai/core` (`ui/core/src/hooks/use-stuck-on-scroll.ts`): drop the returned
`sentinelRef` on a zero-height marker at the bar's natural top and the `stuck`
flag flips true once that sentinel scrolls past the nearest scrollable ancestor's
top edge (it walks up to find that ancestor, so no scroll ref is threaded in).
Shared by `CatalogShell`'s controls row and the app's `ProviderFilterBar` — never
re-copy it locally. For sticky to work, no ancestor between the bar and its scroll
container may add `overflow`/`transform`/`filter`/`contain` (each would clip or
re-anchor the stick).

**Contained "Installed" panel** — in the catalog shell's two-section grammar the
Installed section (yours) is a quiet CONTAINED panel — `rounded-2xl border
border-line bg-card p-4` — so it reads as its own thing above the flat Available
browse below. Its skeleton and "Show all N" expander sit inside the panel padding
with no doubled framing.

**Primary button** — flat and sober (`[data-variant="default"]:is(button, a)`),
not a glossy slab. Kanban resting cards use one token, `--ht-card-solid` (`#2c2c2b`
dark / white light), unified across resting + running + needs-you.

**Seamless title bar (macOS desktop only)** — `titleBarStyle: "Overlay"` +
`hiddenTitle`; the content extends to the top so the traffic lights float over
the app's own background (a transparent drag strip in `workspace-shell.tsx`,
gated to `osIsTauri() && isMac`). `applyTheme` also calls
`getCurrentWindow().setTheme()` so the native chrome tracks the app theme.
Capabilities: `core:window:allow-set-theme` + `…allow-start-dragging`.

**Tuning knobs** live as comments in `futuristic.css` (aurora alphas, glass
blur, `--ht-card-solid`, the canvas tokens). Dark mode is the loved baseline —
when adjusting, scope changes to light (`:root`) and pin dark
(`[data-theme="dark"]`) so it stays put.

**Top-level surface shell (`app/src/components/shell/page-shell.tsx`)** — the four
sidebar destinations (AI hub, Integrations, Organization, Settings) share two
app-local primitives so their width and header spacing are identical.
`PageContainer` is the canonical horizontal column (`mx-auto w-full max-w-5xl
px-8`, the single source of the shared page width; callers add vertical rhythm —
surfaces open at `pt-10`, close at `pb-10` — and it spreads div props so it can
also be a tab's `role="tabpanel"`). `PageHeader` is the canonical title block: a
28px normal-weight `h1` + optional muted subtitle + optional trailing slot. These
are deliberately NOT in `ui/` (page chrome, not a reusable widget → no
inventory/parity churn). The fixed-masthead surfaces (hub, org) split the
container across a `shrink-0` masthead + a scrolling `PageContainer` below; the
single-scroll surfaces (integrations, settings landing) use one. Settings landing
now shares `max-w-5xl` (cards render wider than before, by design).

**Flat "plane" page language (rolling out page by page; first: Integrations).**
The owner is refactoring top-level pages against flat reference designs (the
Integrations page's reference is ChatGPT's Plugins page). The vocabulary, all
tokens: the page sits directly on `background`; list rows are TRANSPARENT at
rest and paint the `hover` fill (`bg-hover`, light `#efefef`) on hover/focus,
never a bordered card around every row; section headers are sentence-case
`text-sm font-medium` with a small trailing `ChevronRight` in `ink-muted`
(`SectionHeader`, `components/integrations/section-header.tsx`, a
non-interactive visual motif, not navigation); rows are a large `rounded-xl`
icon (~56px) + `text-sm font-medium` name over one truncated `text-[13px]`
`ink-muted` description line + ONE quiet trailing glyph (`Plus`, lock, ...) at
the row edge; the page hero is the shared `PageHeader` with a rounded
`bg-input` search field (`border-line-input`, magnifier glyph) in its
`trailing` slot. Two-column row grids collapse to one under `lg`. Shipped
surfaces: the Integrations personal page (`integrations-view/`, see
`knowledge-base/integrations.md` §3) and the agent **Files tab** — the old
nested `rounded-xl border` "file manager window" frame (bordered toolbar,
zebra list with decorative filler stripes, bottom status bar whose 11px
footer links held Upload / Open in File Manager) was flattened onto the
canvas: `FilesBrowser` (`ui/agent/src/files-browser.tsx`) renders a
shrink-0 header (`files-header.tsx`: grid-only breadcrumbs, sort, soft
segmented view toggle in `view-toggle.tsx`, new-folder ghost icon, Upload
as a filled `Button size="sm"` pill + reveal/download-all as a ghost pill)
over a full-bleed scroll/drop body whose content is capped to the shared
`FILES_CONTENT_COLUMN` (`mx-auto w-full max-w-4xl px-6`); list rows are
`h-8 rounded-lg`, transparent at rest, `hover:bg-hover`. Breadcrumbs stay
grid-view-only on purpose: the list view is a hierarchical tree always
rooted at the workspace, so a path crumb there would misstate its scope.
Apply this language when refactoring further pages instead of inventing
new row chrome.

**Settings (`app/src/components/settings/`)** — no sidebar. The landing is the
**overview** (`settings-index.tsx`); it uses the shared `PageContainer` +
`PageHeader` (title `text-[28px] font-normal`). Two row primitives (`settings-row.tsx`), both with a
**bare icon** (no tile/background): `SettingsControlRow` resolves a setting in
place (bare icon · title · right-side control) and `SettingsRow` navigates (adds
a value + chevron). Simple settings are inline control rows rendered straight
into the overview — the section files ARE the controls: `WorkspaceSection`
(name input), `AppearanceSection` (theme pills), `LanguageSection` (locale
select), `AccountSection` (avatar + sign out), `DangerSection` (red delete +
confirm). Only the heavier sections navigate: workspace/user context editors,
members, shortcuts, bug report. Selecting a nav row sets `SettingsView`'s
`active` (the section-id union lives in `settings-index.tsx`); the two context
editors render full-width, the rest in a centered `max-w-xl` column, all under a
`← Settings` back bar. `active === null` is the overview. Account/members rows
appear only when `accountAvailable` / `showMembers`. Version string = overview
footer. Nav-row copy + group titles + `Set`/count values live under
`settings.index.*` / `settings.nav.*` in the three locale files.
