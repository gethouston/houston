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
subtree can **pin the light look regardless of the app theme** by setting
`data-theme="light"` on a wrapper — custom properties inherit, so the scoped
re-declaration re-resolves every `var(--ht-*)`, and thus every Tailwind
`--color-*` utility, inside it (used by the sign-in card). The `dark` Tailwind
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
2. `pnpm --filter @houston/design-tokens build`.
3. Commit source + regenerated `dist/` together (a sync test fails on stale dist).
4. If the change is genuinely visual, update `test/legacy-resolved.json` to the
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
live values. Historic light-mode reference: `--background #fff` · `--foreground
#0d0d0d` · `--secondary #f9f9f9` · `--muted-foreground #5d5d5d` · `--border
#e5e5e5` · `--ring #0d0d0d` · `--accent #f5f5f5` (the futuristic layer now shifts
several of these — the JSON is authoritative).

### `--ht-space-*` (sign-in backdrop)
A deliberately **theme-invariant** group — both `color.light.json` and
`color.dark.json` alias the same `color.space.*` primitives, so the deep-space
backdrop reads identically in light and dark. Feeds the shared
`SpaceScreen` backdrop (see Animation → Space screen backdrop): `--ht-space-canvas`
`#07080f` (near-black indigo base) · `-canvas-glow` `#101430` (gradient top) ·
`-nebula-1` `#38346b` (violet mid) / `-nebula-2` `#14384c` (teal accent) — the
nebula-shader palette + the fallback radial glows · `-nebula-core` `#b8b2e8`
(near-white violet highlight in the shader) / `-nebula-dust` `#04050c` (dark
dust-lane tint) · `-star` `#dce2f7` (cool-white starfield) · `-star-warm` `#f6e7cd` (the warm ~10%
of stars) · `-haze` `#8f9bc9` (the faint painted Milky-Way band) · `-foreground`
`#ffffff` (pure-white wordmark + logo, currentColor) · `-foreground-muted`
`#8e96b8` (footer links). The `OrbitLoader` rocket + comet trail reuse
`-foreground` (pure white, head) and `-star` (cool white, tail) — no dedicated
comet tokens.

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
Override `--color-primary` via globals.css. NEVER hardcode hex — always semantic token.

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
One shared component (`app/src/components/cards/row-card.tsx`) for the compact horizontal cards in chat and integration surfaces: monochrome logo/icon left (`size-8 rounded-lg` media box), `text-[13px]` title + `text-[11px]` muted description, single right-side action slot. Always grey `bg-secondary`, `rounded-xl`, `px-3 py-2.5`. The `inline` prop renders a `<span>` row so it can sit inside assistant markdown prose; `size="md"` gives a roomier modal-heading variant. Pair with `RowCardButton` (`h-7 rounded-full` pill) — its `icon` is **optional**, so action buttons are text-only by default (only the Composio cards pass a trailing link icon), and it is built on `AsyncButton` (HOU-465 rage-click guard). The media slot takes either a `ProviderGlyph` (`shell/provider-logos.tsx`) — monochrome, never full-color brand marks, keyed by provider id with an initial fallback — or a lucide icon. Used by: reconnect / sign-in (`UnauthenticatedCard`, `ProviderReconnectCard`), rate-limit (`RateLimitedCard`, clock icon), the provider-switch dialog, and the Composio sign-in / link cards.

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

### Space screen backdrop
`SpaceScreen` (`app/src/components/space/space-screen.tsx`) is the **shared
full-screen space layout**: the `--ht-space-canvas` base, the `SpaceBackground`
deep-space backdrop, and a `z-10` content slot on top. Both the **sign-in
screen** (`components/auth/sign-in-screen.tsx`) and the **workspace-loading
splash** (`components/shell/workspace-loading.tsx`) render inside it, so the whole
boot experience reads as one continuous space. The **sign-in screen** floats a
card pinned to the **light palette** (`data-theme="light"`) so it stays a bright,
calm card regardless of app theme (Mercury pattern: dark backdrop, light card).
The **workspace-loading splash has NO card** — the `OrbitLoader` + status line sit
directly on the dark backdrop, using the space-foreground token family
(`--ht-space-foreground` / `-foreground-muted`, same as the sign-in wordmark/footer).
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
deep-space layer itself — an `aria-hidden`, `pointer-events-none` absolute layer,
all colour from the theme-invariant `--ht-space-*` tokens. Three stacked sublayers:

**(1) Base gradient** — a near-black indigo `linear-gradient` (canvas-glow → canvas),
always present; it is also the base the WebGL fallback draws over.

**(2) Nebula — WebGL fragment shader** (`nebula-gl.tsx` + `nebula-shader.ts` +
`nebula-noise.ts` + `nebula-program.ts`). A fullscreen GLSL ES 1.00 shader (runs on
`webgl2`, falls back to `webgl`), no textures, no libs. Technique: **5-octave FBM**
(lacunarity 2, gain 0.5) with a **double domain warp**
(`palette(fbm(p + K·fbm(p + K·fbm(p))))`, **K = 2.5**) so it reads as filamentary
nebula, not cloud; the **inner** warp coordinate drifts with time
(**0.004 units/s**) so the nebula *morphs in place* — nothing translates. **Ridged
abs-noise** carves dark dust lanes; a knee-at-0.16 highlight-only tone curve plus a
per-pixel **hash dither** kill banding (this replaced the old canvas grain — no
double noise). Brightness is **biased along the Milky-Way diagonal** using the exact
`starfield-model.ts` geometry (direction `(w, -h)`, screen centre, half-width
`0.175·diag`) so nebula + star band read as one structure. **Peak luminance is
clamped to ≤ 0.22** (Rec.709 luma) so the card is always the brightest thing on
screen. Noise is Stefan Gustavson / Ian McEwan's **public-domain** simplex (NOT a
Shadertoy port). Palette = six `vec3` uniforms read once from `--ht-space-canvas`,
`-canvas-glow`, `-nebula-1` (violet mid), `-nebula-2` (teal accent), `-nebula-core`
(near-white violet highlight), `-nebula-dust` (dark lane tint) — no colour literal
in code. Perf: internal resolution = css · `min(DPR, 1.5)` · 0.6 (GPU-upscaled);
**30 fps** cap (skipped rAF ticks); paused on `visibilitychange`; **adaptive
degrade** — if the draw dispatch stays > 8 ms it drops 5 → 3 octaves, then freezes
to a static frame. `prefers-reduced-motion` → exactly one frame. If WebGL is
unavailable or the context is lost (`webglcontextlost`), `NebulaGL` calls back and
`SpaceBackground` swaps in the **fallback**: two heavily-blurred (130px) barely-there
`--ht-space-nebula-1/2` radial glows drifting on 78–88s mirrored framer-motion loops
(the previous implementation, kept as the fallback branch).

**(3) Starfield** (`starfield.tsx` + `starfield-model.ts` + `starfield-sprites.ts`),
the middle layer over the nebula. Magnitude-skewed brightness (`pow(rand, 2.5)` — most
faint, few bright, radius correlated), colour temperature (~65% cool-white
`--ht-space-star` / ~25% neutral / ~10% warm `--ht-space-star-warm`), a diagonal
**Milky-Way band** (~57% of near stars biased into a ~35%-of-diagonal strip at ~2.5×
density, plus a faint painted `--ht-space-haze` band). A **far depth layer** adds
~60% more stars (0.2–0.4px, alpha ≤ 0.15, half drift speed) for parallax depth.
**Bloom** on the brightest ~8% uses one of **three temperature-tinted** sprites
(white-hot core, tinted outer glare) keyed by the star's temperature bucket. Only
faint stars twinkle (±15%, 5–12s); drift is near-still (≤0.8px/s). The static layer
keeps the haze band + corner **vignette** but no longer paints grain (the shader
dither supersedes it). The draw loop is allocation-free (precomputed `fillStyle` per
star, twinkle via `globalAlpha`, offscreen sprites `drawImage`d). `prefers-reduced-motion`
→ a single static frame. Restraint over spectacle — it is a backdrop, never the show.

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
card (`canvas-screen`) on a recessed **window gutter**; the sidebar is
transparent and melts into the gutter. Tokens: `--ht-canvas-gutter` (window bg)
and `--ht-canvas-screen` (the floating screen). The mission panel opens as a
second rounded card with a gutter gap.

**Dark mode** — the signature look: a multi-radial **aurora glow** on
`body::before` (blue/indigo/orange, slow 32s drift, disabled under
`prefers-reduced-motion`) + translucent **glass** surfaces (`.bg-card`,
`.bg-popover`, sidebar) with `backdrop-filter` blur.

**Light mode** — the cool, solid **"Aurora" palette** (no glow mesh — it read as
"glitter" over solid surfaces): gutter `#eef1f7`, screen `#fff`, cards `#f4f6fc`,
cool blue/indigo border. Clean and futuristic by restraint, not decoration.

**Modals are glass, not slabs.** All modal primitives — `DialogContent`
(`ui/core/components/dialog.tsx`), `AlertDialogContent`, `SheetContent`, and the
AI-Hub `ModalShell` — render on the translucent **`bg-card`** surface (frosted
blur + top sheen from futuristic.css), NOT opaque `bg-background`, so the aurora
canvas bleeds through in dark mode like the kanban columns (`bg-secondary`). The
scrims are deliberately light for the same reason: Dialog overlay `bg-black/25`,
Alert/Sheet `bg-black/35` (down from /40–/50). Change the surface centrally in
those four primitives — no modal should hardcode its own background.

**Primary button** — flat and sober (`[data-variant="default"]:is(button, a)`),
not a glossy slab. Kanban resting cards use one token, `--ht-card-rest` (`#2c2c2b`
dark / white light), unified across resting + running + needs-you.

**Seamless title bar (macOS desktop only)** — `titleBarStyle: "Overlay"` +
`hiddenTitle`; the content extends to the top so the traffic lights float over
the app's own background (a transparent drag strip in `workspace-shell.tsx`,
gated to `osIsTauri() && isMac`). `applyTheme` also calls
`getCurrentWindow().setTheme()` so the native chrome tracks the app theme.
Capabilities: `core:window:allow-set-theme` + `…allow-start-dragging`.

**Tuning knobs** live as comments in `futuristic.css` (aurora alphas, glass
blur, `--ht-card-rest`, the canvas tokens). Dark mode is the loved baseline —
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
