# Design System

**Read `/DESIGN.md` first.** That repo-root file is the compact, agent-facing
spec — the rules you hold in context before touching any UI (hard rules, token
quick-reference, motion, banned defaults, polish checklist, component
inventory). This doc is the **deeper narrative layer**: the rationale, the
detailed component and animation guidance, and the futuristic-theme internals
that `/DESIGN.md`'s telegraphic tables can't hold. Precedence on any conflict:
`packages/design-tokens/tokens/*.json` (tokens win) › this doc › `/DESIGN.md`.

The current look is the **futuristic theme** — a calm, futuristic desktop AI
product ("quiet expert"). Dark mode is the loved baseline (aurora glow + glass);
light mode is the cool solid light palette. Content stays near-monochrome;
colour lives in the chrome. Everything below describes the current system.

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
rule (`ui/core/src/canvas.css`, `app/src/styles/futuristic.css`, app `globals.css`) carry a
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
5. **Invisible borders, visible actions.** Borders 5–15% opacity (via `--ht-line` / `.ht-hairline`, never a raw rgba). Action buttons (Start/Approve/Delete) always visible — never hover-only.

## Color

Live values: `packages/design-tokens/tokens/*.json`, or component showcase →
Colors (`pnpm --filter @houston-ai/showcase dev`).

Both light and dark ship on every screen. Primary ink is near-black, NEVER pure
black. Content stays near-monochrome; the **chrome** (window
background, glass, aurora glow) carries deliberate brand colour.

### Tokens

The semantic `--ht-*` set (re-exported to Tailwind `--color-*`) is generated from
`@houston/design-tokens` — see `tokens/semantic/color.{light,dark}.json` for the
live values (each token carries its own light AND dark value; dark glass keeps
its transparency inside the value).

The owner vocabulary (say these words to direct changes):
- **Grounds**: `gutter` (`--ht-base`, the window frame the sidebar melts into) →
  `background` (the main pane / floating "screen") → `input` (fields, composer,
  floating cards, slightly recessed on the screen).
- **Elevated**: `card` / `card-hover` (glass) / `card-solid` (solid board card)
  / `popover` / `dialog` (both SOLID — floating surfaces never bleed).
- **Text**: `ink`, `ink-muted` (+ per-surface `card-text`, `popover-text`).
- **Interactive**: `action`/`action-text` (filled CTA), `hover` (row/menu hover
  fill), `chip`/`chip-text` + `chip-subtle` (soft fills).
- **Lines & focus**: `line` (hairlines), `line-input` (field borders), `focus`.
- **Status**: `danger`, `success`, `warning`, `highlight` (each with `-text`).
- Untouched families: `agent.*` (agent avatar palette),
  `person-*` (HUMAN avatar palette — `slate` / `sage` / `mauve` / `taupe` /
  `indigo` fills, `person-initials`, and the `person-overflow` /
  `person-overflow-text` pair for the "+N" chip. Deliberately DESATURATED so a
  teammate's face never competes with a vivid agent helmet; unlike `agent.*`
  these ARE bridged to Tailwind utilities (`bg-person-slate`,
  `text-person-initials`, …) because the mission face stack picks a tone by
  className, hashed from the person's stable id — see
  `ui/board/src/kanban-people-tone.ts`),
  `sidebar*` (with `-text`/`-hover`/`-line`/`-active` suffixes; `sidebar-active`
  is the selected-row fill, a clear step above hover in both themes).

The Tailwind utility for the gutter token is **`bg-gutter`** (`--color-gutter →
--ht-base`), deliberately NOT `bg-base` — see the "`base` colour naming gotcha"
under Animation → First-run flow for why the alias was renamed.

### The surface ladder (real tokens)

There is **no `layer-*` token** — the surface stack is expressed through the
grounds/elevated tokens above. Bottom → top (with the Tailwind utility and
role):

- **`bg-gutter`** (`--ht-base`) — the recessed window
  frame the sidebar melts into. Sits one step BELOW `background` so the screen
  reads as raised (in `ui/core/src/canvas.css` this is `body`'s `background-color`).
- **`bg-background`** (`--ht-background`) — the floating "screen" and the
  **standard main pane** every content surface
  sits on (board, chat, routines, integrations, files, settings, AI hub…).
  Applied via the `.canvas-screen` class (which also carries the dark
  frosted-glass blur); `bg-background` stays on the element as the theme-off
  opaque fallback. Fields (`bg-input`) sit slightly recessed on it, and
  cards/popovers separate via hairlines
  (`border-line` / `.ht-hairline`) rather than surface contrast.
- **`bg-input`** (`--ht-input`) — inputs, the composer, pills. NOT a pane
  background (a pane painted `bg-input` becomes a slab on the canvas).
- **`bg-card` / `bg-card-hover`** (glass `white-68`/`white-76` → glass
  `neutral-50`/`neutral-58`) — cards/panels that should **float above** the
  canvas (mission cards, settings group cards, AI-hub material). White + border +
  sheen is what makes them lift off the gray.
- **`bg-popover` / `bg-dialog`** — menus / modals; **SOLID in
  both themes** (see Modals below).
- **`bg-chip` / `bg-chip-subtle`** — recessed panels that sit BELOW the card
  tier (board columns, provider rows, soft chips).

The `futuristic.css` AI-Hub material comment states the same ladder as its depth
vocabulary: `bg-background → bg-card → bg-card-hover → bg-popover`, with depth
from HAIRLINE INSET RINGS (`.ht-hairline`), not opaque borders or drop shadows —
real shadow is reserved for floating chrome (modals/popovers).

### Retired space scene
The app space scene and its `space-*` token family were retired. The boot
splash is the themed screen surface (see Animation → Workspace loading splash);
secure-storage and migration progress states use simple semantic-token screens
with the shared `Spinner`.

### Borders & lines
The "invisible borders" principle holds: hairlines are very low opacity (5–15%).
Reach for the **`border-line`** token (`--ht-line`) or the **`.ht-hairline`**
inset-ring utility (a 1px `outline` in the `--ht-line` colour, so it composes
with glass sheen and Tailwind ring/shadow utilities) — never a raw `rgba`.
Field borders use **`border-line-input`** (`--ht-line-input`).

### Status
`success` · `warning` · `danger` (each with a `-text`), plus `highlight` (brand
wash + ink). Links use the same semantic status/highlight family.

### Color restraint
The monochrome discipline holds for *content* (text, controls); the futuristic
theme adds intentional **ambient brand colour** as chrome:
1. card-running-glow gradient (blue→indigo→orange→yellow) — the brand palette
2. the **aurora glow** behind dark mode (same blue/indigo/orange family)
3. the cool **Aurora** light palette (blue/indigo-tinted gutter + cards)
4. status indicators, agent/channel avatars, links

"Never decorative colour" is scoped to *content surfaces*; the **chrome**
(window background, glass, glow) carries brand colour deliberately.

### Agent avatars
Use `HoustonAvatar` from `@houston-ai/core` for agent avatar badges. Resting
state = no border, gray background softly mixed with the agent color, colored
helmet glyph. Running state = same badge inside the comet glow. Resolve stored
semantic ids with `resolveAgentColor` from `@houston-ai/core`, not app-local
helpers, so desktop and mobile render same palette.

## Brand theming
Override `--color-action` via globals.css. NEVER hardcode hex — always semantic token.

## The mandatory spec lives in `/DESIGN.md`

The hard rules, the token quick-reference (type scale, spacing, radii, motion,
elevation), the motion contract, the banned generic-AI defaults, the polish
checklist and the `@houston-ai/core` component inventory live in
**`/DESIGN.md`** — read it, it is mandatory. This doc does not restate them; it
records what is BUILT on top of them.

One place the shipped app differs from that spec's type table: the canonical
page title is **24px**, not 28px. `PageHeader`
(`app/src/components/shell/page-shell.tsx`) renders
`<h1 className="text-2xl font-normal text-ink">`. The portable-agents wizard
(`app/src/components/portable/*`) is the one surface still on
`text-[28px] font-normal leading-tight`.

## Buttons
Pill shape (`rounded-full`) everywhere. Use the `Button` primitive from
`@houston-ai/core` and its variants — never hardcode a fill. Variants map to
tokens:

- **Primary:** filled `bg-action` / `text-action-text`, `h-9 px-3 text-sm font-medium` (flat and sober — not a glossy slab).
- **Secondary:** `bg-input` + `border-line`, `text-ink`, hover `bg-hover`.
- **Ghost:** transparent, `rounded-lg w-9 h-9`, hover `bg-hover`.
- **Soft chip:** `bg-chip`, `rounded-full h-9 px-3`, hover `bg-chip-solid-hover`.
- **Large:** `h-11 px-4`.

## Composer (signature)
`max-w-3xl rounded-[28px] bg-input p-2.5` + the signature multi-shadow (the
tokenized `composer` elevation):
```
0 4px 4px rgba(0,0,0,0.04),
0 4px 80px 8px rgba(0,0,0,0.04),
0 0 1px rgba(0,0,0,0.62)
```
Grid: leading (attach) | primary (text) | trailing (send).

## Messages
- **User:** `ml-auto max-w-[70%] rounded-3xl bg-chip px-5 py-2.5`
- **Assistant:** no bubble. Plain markdown, left-aligned, transparent.

## Cards
`bg-card` (or `bg-input` for a floating white card), `border-line` /
`.ht-hairline`, `rounded-xl`, hover lift. Running state = `card-running-glow`
animation border. Kanban resting cards use one token, `--ht-card-solid`, unified
across resting + running + needs-you.

### RowCard (inline notice + integration cards)
One shared component (`app/src/components/cards/row-card.tsx`) for the compact horizontal cards in chat and integration surfaces: monochrome logo/icon left (`size-8 rounded-lg` media box), `text-[13px]` title + `text-[11px]` muted description, single right-side action slot. Always grey `bg-chip`, `rounded-xl`, `px-3 py-2.5`. The `inline` prop renders a `<span>` row so it can sit inside assistant markdown prose; `size="md"` gives a roomier modal-heading variant. Pair with `RowCardButton` (`h-7 rounded-full` pill) — its `icon` is **optional**, so action buttons are text-only by default (only the Composio cards pass a trailing link icon), and it is built on `AsyncButton` (HOU-465 rage-click guard). The media slot takes either a `ProviderGlyph` (`shell/provider-logos.tsx`) — monochrome, never full-color brand marks, keyed by provider id with an initial fallback — or a lucide icon. Used by: reconnect / sign-in (`UnauthenticatedCard`, `ProviderReconnectCard`), rate-limit (`RateLimitedCard`, clock icon), the provider-switch dialog, and the inline Composio `#houston_toolkit` link card. **Not** the interaction-card stepper's connect/signin STEPS — those compose the shared `InteractionModal` shell (`ui/chat`, reference "Coworker card" look, landed in inventory v19, reshaped in v41): the `(icon) action` title (brand logo `sm` beside "Connect {app}" at REGULAR weight, via `InteractionModalTitle`) is on the same header row as the pager + dismiss X; the connect body is the agent's foreground reason, while sign-in retains its muted explainer. The FOOTER is the unified "Not now" + Esc hint beside a filled CTA with a return-key glyph, and the free-text alternate-instruction row follows it in the modal's trailing region. Weight is restrained: color tone carries the hierarchy, so the title and labels are regular — `font-medium` survives only on the Recommended chip, the number badge, and the CTA label; no competing bolds. "Not now" travels WITH the CTA (present wherever the CTA is, including a reconsidered skip). The signin/connect body renders its OWN `InteractionModal` wired with the stepper's `StepChrome` (pager + dismiss), so ui/chat stays auth/Composio-unaware. See `chat-connect-interaction-card.tsx` / `chat-signin-interaction-card.tsx`.

Interaction cards use a visible-at-rest header chevron and a 40vh scrolling body cap. Collapsing retains the loud title, pager, and expand control so a blocked agent is never visually lost. Plan approval uses this same shell, clamps its lede to two lines, and places the shared free-text row in the fixed trailing region. It replaces the composer while shown; the complete plan belongs in the assistant transcript.

> **AI Models hub is the one deliberate exception.** The hub (Providers/Models tabs) reaches for a full-color brand mark — `BrandMark` (`app/src/components/provider-browser/brand-mark.tsx`) renders the same `ProviderGlyph` boxless (no tile or wash), full-bleed at sm/md/lg (`size-6/8/10`), colored via the sanctioned hex map in `shell/provider-brand-colors.ts` (the ONLY place raw brand hex may live; every other surface stays on tokens). This is a "candy store" recognition device scoped to the hub — chat surfaces (RowCard, provider-switch, error/reconnect cards) stay monochrome. Multi-button error cards stay on `ErrorCard` (icon-bubble) in `provider-error-cards/shared.tsx`.

## Empty states
`Empty` from `@houston-ai/core`. Big `text-2xl font-semibold` title + description + optional action. No icon-in-box. Container must be `flex flex-col` for `flex-1 justify-center`.

## Progress panel
`ProgressPanel` from `@houston-ai/chat`. Agent calls `update_progress({steps})`. States: pending (empty circle) / active (spinner + highlight) / done (green check). Header: "X of Y steps complete". Renders right-side alongside ChatPanel.

## Layout

```
+----------+---------------+-------------+
| Sidebar  | Page header   | Right Panel |
| 220px    |---------------| (optional)  |
|          | Main Content  |             |
+----------+---------------+-------------+
```

(The middle column's top band used to be the per-agent `TabBar`. Screens are all
top-level now, so it is each screen's own `PageHeader` / section chrome — the
library `TabBar` survives in `@houston-ai/layout` but the app mounts none. There
is no fixed-height app header band.)

- **Sidebar** — `w-[220px]` expanded, `w-[56px]` collapsed, with a 200ms
  `transition-[width]` between them (`ui/layout/src/sidebar.tsx`). It is
  **transparent** (`bg-sidebar` resolves transparent), so it melts into the
  window gutter (`bg-gutter`, the Arc/Zen canvas layout).
- **Sidebar rows** — every interactive line is the same row, defined once in
  `ui/layout/src/sidebar-classes.ts` and spent only by `SidebarRowButton`:
  fixed `h-7` (28px) height in every state, a 20px glyph box
  (`sidebarIconBox`), the fill spanning the full rail with hierarchy carried by
  the glyph indent (`depthBlock` `pl-2` / `depthChild` `pl-5`), and exactly two
  type steps (`sidebarRowType`: `item` 13px for anything that points somewhere,
  `band` 12px for the row that names the list). Hover is `sidebar-hover` (6%),
  selected is `sidebar-active` (10%) — the 6-of-10 ratio is deliberate.
  Trailing controls are siblings of the row button (never nested) and are
  always rendered, muted at rest; a header with no menu still reserves the
  column (`sidebarRowAffordanceGutter`) so labels truncate at the same point.
- **Right panel** — 45% width, 380px min. Split view resizable, default 55/45.
- **Chat** — max-width 768px (`max-w-3xl`).

## Animation
- **card-running-glow** — rotating conic-gradient border. blue→indigo→orange→yellow. 2.5s infinite. Comet tail.
- **Framer Motion (Board):** enter `opacity:0, y:8` → `opacity:1, y:0`. Exit `y:-8`. Duration 0.2s, easing `[0.25, 0.1, 0.25, 1]`. `AnimatePresence` with `popLayout`.
- **Spring preferred:** `{type:"spring", stiffness:300, damping:30, mass:1}`.
- **typing-bounce** — 3-dot indicator, vertical translate + opacity.
- **tool-pulse** — pulsing dot, 1s, active tool calls.

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
  photo-backdrop variant or glass remap.
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
  light tokens. Progress uses the shared `Spinner`; the done congrats uses the
  semantic success treatment in `SuccessCheck`.
- **`base` colour naming gotcha (RESOLVED, 2026-07): `text-base` is a plain
  font-size utility again.** The gutter token's Tailwind alias was renamed
  `--color-base` → `--color-gutter` (`ui/core/src/globals.css`) precisely because
  a colour named `base` made Tailwind also emit `text-base` as a COLOUR utility —
  any `text-base` heading without its own colour class rendered
  background-coloured (invisible on a matching surface, both themes; the
  forced-update dialog title was the casualty that exposed it). Never
  reintroduce a colour token named `base` — the gutter utility is `bg-gutter`.

### Workspace loading splash (screen tokens)
The workspace-loading splash (`shell/workspace-loading.tsx`) is a flat themed
surface since 2026-07 — no space theme: full-screen `bg-background canvas-screen`
(light = the `#fcfcfc` screen, dark = the glass screen over gutter + aurora), a
`Spinner` from `@houston-ai/core` above the status line, both `text-ink-muted`,
one entrance (opacity + 8px rise, entrance easing, `elegant` 582ms;
reduced-motion collapses to opacity-only), plus the local macOS drag region.
Because the splash is themed, the persisted theme must apply PRE-paint:
`app/src/lib/theme-boot.ts` mirrors the resolved theme to
`localStorage["houston.theme.cache"]` on every apply, and `applyBootTheme()`
runs at module scope in both entries (desktop `app/src/main.tsx`, web
`packages/web/src/main.tsx`) before React mounts. The engine preference stays
the source of truth — `loadTheme()` reconciles after the handshake.

One frame lands even earlier: the document itself, before any module runs. Both
entry documents (`app/index.html`, `packages/web/index.html` — **kept
identical**) carry the same tiny head block: a `<style>` painting `html`
`#fcfcfc` (the splash's light screen) and `html[data-theme="dark"]` `#141416`
(`--ht-base`, the opaque gutter the dark splash's glass sits on), plus a
parser-blocking inline `<script>` that reads the same `houston.theme.cache` key
in a `try/catch` and sets `data-theme="dark"` when it says so. No mirror or
unreadable storage → the light default, same resolution as `applyBootTheme()`.
Inline is safe on both shells: Tauri's `security.csp` is `null`
(`app/src-tauri/tauri.conf.json`) and the web's Firebase Hosting CSP is only
`frame-ancestors 'none'` (`packages/web/firebase.json`). Playwright contexts
start with empty storage, so the visual suite is unaffected.

### Boot gate states
The legacy space scene was retired: the `space-*` token family, `SpaceScreen`,
`OrbitLoader`, and the Milky Way assets are gone (git history if ever needed).
The workspace-loading splash is the themed screen surface above; the
storage-unavailable gate and the cloud-migration progress screen render on the
standard semantic canvas with the shared `Spinner`.

## Design judgment is Julian's

- Build to `/DESIGN.md`, then **show him** — never self-review the look.
- **No `/design-review` screenshot loops.** They are forbidden (`houston/CLAUDE.md`).
- `/frontend-design` variants only if he asks for options (3–5 genuinely
  distinct directions, two-pass discipline).
- UI touched → `pnpm --filter houston-web test:visual`, baselines blessed once
  per element, never during iteration.

## Component showcase (`ui/showcase`)

`pnpm --filter @houston-ai/showcase dev` → http://localhost:5199 — the living
reference for the design system. Landing page: Foundations → Colors (all
semantic `--ht-*` tokens with live theme-resolved values, plus the aurora/glass
Effects). Nav tiers: Foundations · Primitives (all ui/core components:
Variants/States/Sizes/Props/allowed Tokens, derived from source) · Product
areas (Activity, Chat, Routines, Skills, Your Agents, Agent Store — the
feature-package components under the names those surfaces carried as agent tabs;
they are team sections and agent-settings sections now, and the showcase's
`SURFACE_RULES` map keeps the historical names). Every page shows
"Used in" chips generated from real import sites (`pnpm --filter
@houston-ai/showcase gen:usage`; staleness is test-enforced). New/changed ui
components get a specimen in the same PR; a broken specimen fails the SSR test
suite.

## Futuristic theme

The current desktop look. Two revert-able layers imported by
`app/src/styles/globals.css` (delete the `@import`s to fully revert): the
**shared canvas** `ui/core/src/canvas.css` (aurora, glass surfaces, arc canvas,
depth utilities — also consumed by the store playground so store components
preview on the real canvas) and the **app-only chrome** left in
`app/src/styles/futuristic.css` (`.ht-live-glow`, AI-Hub modal surface). Plus a
few targeted component/token changes. Surface colours route through `--ht-*`
tokens, re-exported to Tailwind as `--color-*`, so the theme is mostly token
overrides — not a 20-component rewrite.

**Arc / Zen "canvas" layout.** The main content floats as a rounded "screen"
card (`bg-background`; the `.canvas-screen` CSS class) on a recessed **window
gutter** (`bg-gutter`, `--ht-base`); the sidebar is transparent and melts into
the gutter. The mission panel opens as a second rounded card with a gutter gap.
There is **no `--ht-layer-*` token** — the window bg is `--ht-base` (`bg-gutter`)
and the floating screen is `--ht-background` (`bg-background`).

**The canvas is the standard main surface — a light gray, not white (light
mode).** `bg-background` (`--ht-background`) is the tone every content pane
(board, chat, routines, integrations, files, settings, AI hub, agent settings…)
sits on. In **light** it is a calm gray promoted to the ONE standard so cards,
the composer, inputs, and popovers **float** on it rather than vanishing
white-on-white. In **dark** it is frosted glass (`glass.screen-55`); the light
change never moves dark.
Consumers reference the SAME tone as one source of truth: the chat panel
(`ui/chat/chat-panel.tsx`) is `bg-background dark:bg-transparent` (transparent in
dark to let the pane's glass through). The two shell panes
(`shell/workspace-shell.tsx`) get it via `rounded-2xl bg-background
canvas-screen` — the `.canvas-screen` class carries the dark frosted-glass blur,
so keep the class (never drop it for a bare `bg-background`, which would lose the
dark glass); the light-gray value is purely the token.

**Dark mode** — the signature look: a multi-radial **aurora glow** on
`body::before` (blue/indigo/orange, slow 32s drift, disabled under
`prefers-reduced-motion`) + translucent **glass** surfaces (`.bg-card`,
sidebar) with `backdrop-filter` blur. FLOATING surfaces (`popover`, `dialog`)
are NOT glass — they are solid in both themes (see "Modals" below).

**Light mode** — the cool, solid light palette (no glow mesh — it read as
"glitter" over solid surfaces): `cool.gutter`, the standard light-gray canvas,
near-white glass cards (`bg-card`), and a cool blue/indigo border. Clean and
futuristic by restraint, not decoration.

**Modals and popovers: SOLID in both themes.** All modal primitives —
`DialogContent` (`ui/core/components/dialog.tsx`), `AlertDialogContent`,
`SheetContent`, and the AI-Hub `ModalShell` — render on the dedicated
**`bg-dialog`** surface token; menus/popovers on **`bg-popover`**. Both tokens
are OPAQUE in both themes. They were glass once, but a floating surface that
sits over content must never bleed it through: the glass fills read as solid
only via `backdrop-filter`, which
WebView2 does not reliably composite (GPU/driver dependent, silently no-ops),
so desktop modals painted see-through — solid tokens fix it everywhere, web
included, with no per-platform fallback. Never re-add alpha to these tokens or
put an opacity modifier (`bg-popover/95`) or `backdrop-blur` on a floating
surface. The token is separate from `card` on purpose: `card` stays glass for
NON-floating surfaces (cards over the canvas). Wired: `dialog`/`popover` in
`tokens/semantic/color.{light,dark}.json` → `--ht-dialog`/`--ht-popover` →
`@theme` (`ui/core/src/globals.css`) → Tailwind `bg-dialog`/`bg-popover`; the
top-sheen rules live in `ui/core/src/canvas.css`. The scrims are deliberately light:
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
not a glossy slab. Kanban resting cards use one token, `--ht-card-solid`,
unified across resting + running + needs-you.

**Seamless title bar (macOS desktop only)** — `titleBarStyle: "Overlay"` +
`hiddenTitle`; the content extends to the top so the traffic lights float over
the app's own background (a transparent drag strip in `workspace-shell.tsx`,
gated to `osIsTauri() && isMac`). `applyTheme` also calls
`getCurrentWindow().setTheme()` so the native chrome tracks the app theme.
Capabilities: `core:window:allow-set-theme` + `…allow-start-dragging`.

**Tuning knobs** live as comments in `ui/core/src/canvas.css` (aurora alphas,
glass blur, `--ht-card-solid`, the canvas tokens). Dark mode is the loved baseline —
when adjusting, scope changes to light (`:root`) and pin dark
(`[data-theme="dark"]`) so it stays put.

**Top-level surface shell (`app/src/components/shell/page-shell.tsx`)** — the SIX
sidebar destinations, in order (`buildSidebarNavItems`,
`app/src/components/shell/sidebar-chrome.tsx`): Mission Control · Integrations ·
Skills · AI Models (rendered only when `showAiModels`) · Agent Store · Settings.
Team rows follow below them, under the band that names the list. Usage,
Permissions and Admin are NOT destinations since HOU-788 — they are sections
inside Settings, carried by the same primitives.
`PageContainer` is the canonical horizontal column (`mx-auto w-full max-w-4xl
px-8`, the single source of the shared page width; callers add vertical rhythm
and it spreads div props so it can also be a tab's `role="tabpanel"`). Two
vertical rhythms, by depth: a TOP-LEVEL surface opens and closes itself
(`py-10`); a screen under a back bar only closes (`pb-10`) because the bar
above it (`back-bar-screen.tsx`, `px-8 pt-8 pb-2`) already sets the top rhythm —
no per-screen top nudges.
`PageHeader` is the canonical title block: a 24px normal-weight `h1`
(`text-2xl font-normal text-ink`) + optional muted subtitle + optional trailing
slot. These are deliberately NOT in `ui/` (page chrome, not a reusable widget →
no inventory/parity churn). The fixed-masthead surfaces (hub, org) split the
container across a `shrink-0` masthead + a scrolling `PageContainer` below; the
single-scroll surfaces (integrations, settings landing) use one.

**Flat "plane" page language (rolling out page by page; first: Integrations).**
The owner is refactoring top-level pages against flat reference designs (the
Integrations page's reference is ChatGPT's Plugins page). The vocabulary, all
tokens: the page sits directly on `background`; list rows are TRANSPARENT at
rest and paint the `hover` fill (`bg-hover`) on hover/focus,
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
`knowledge-base/integrations.md` §3) and the **Files** surface (`AgentFilesSurface`,
mounted by a team's Files section) — the old
nested `rounded-xl border` "file manager window" frame (bordered toolbar,
zebra list with decorative filler stripes, bottom status bar whose 11px
footer links held Upload / Open in File Manager) was flattened onto the
canvas: `FilesBrowser` (`ui/agent/src/files-browser.tsx`) renders a
shrink-0 header (`files-header.tsx`: one 36px toolbar band — a `max-w-md`
search field, the single filled `New ▾` pill that owns every way of adding
something, then icon-only download-all/reveal, sort and the view tabs —
plus grid-only breadcrumbs) over a full-bleed scroll/drop body using the
pane's FULL width through `FILES_CONTENT_COLUMN` (`w-full px-6`). The LIST
view is the purest form of the language: no rules anywhere (not under the
column headers, not between rows), 52px `rounded-xl` rows transparent at
rest that paint `hover:bg-hover` under the pointer and `bg-chip-subtle`
when checked, `text-sm font-medium` names over `text-xs` `ink-muted`
metadata right-aligned into one packed block. Breadcrumbs stay
grid-view-only on purpose: the list view is a hierarchical tree always
rooted at the workspace, so a path crumb there would misstate its scope.
Apply this language when refactoring further pages instead of inventing
new row chrome.

**Settings (`app/src/components/settings/`)** — no sidebar. The landing is the
**overview** (`settings-index.tsx`); it uses the shared `PageContainer
className="py-10"` + `PageHeader`. Two row primitives (`settings-row.tsx`), both with a
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
