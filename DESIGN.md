# DESIGN.md — Houston UI spec (load before ANY UI work)

## 1. What this file is
Mandatory context for every coding agent (Claude Code / Codex) before touching UI. Distills the canonical sources into rules you can hold in context.
Canonical sources, in precedence order: `packages/design-tokens/tokens/*.json` (source of truth — **tokens win on any conflict**) › this file (the doctrine). If this file disagrees with the token JSON, the JSON is right — fix this file.

## 2. Product design identity
Houston is a calm, futuristic desktop AI product — "quiet expert," not flashy, not corporate. Current look = the **futuristic theme**: the shared canvas `ui/core/src/canvas.css` (aurora, glass surfaces, depth utilities — imported after core globals so its overrides win; also consumed by the store playground and, eventually, agents.gethouston.ai) plus the app-only chrome left in `app/src/styles/futuristic.css` (AI-Hub `.ht-live-glow` / modal surface).
- **Arc / Zen "canvas" layout.** Main content floats as a rounded "screen" card (`bg-background`, `.canvas-screen`) on a recessed window **gutter** (`bg-gutter`); the sidebar is transparent and melts into the gutter.
- **Dark mode is the loved baseline** — a slow-drifting multi-radial **aurora glow** (blue/indigo/orange, 32s) on `body::before` + translucent **glass** surfaces with `backdrop-filter` blur.
- **Light mode** — cool solid light palette (gutter, screen, and slightly recessed fields), no glow mesh (read as glitter over solids). Clean by restraint. ("Aurora" refers ONLY to the dark-mode glow — themes are just "light" and "dark".)
- **Near-monochrome content, brand-coloured chrome.** Text/controls stay grayscale; colour lives in chrome (aurora, glass sheen, running-card glow) + semantic status + agent avatars + links. Never decorative colour on content surfaces.
- Both themes ship on every screen via `[data-theme]`. Floating surfaces (modals, popovers) are **solid** in both themes — never glass, never bleed content.

## 3. Hard rules (non-negotiable)
1. **Semantic tokens only. Never a raw hex/rgba/px literal** in `app/` or `ui/`. A visual change is a token edit (`packages/design-tokens/tokens/*.json`), never a hardcoded value. Sanctioned raw-hex exceptions (the ONLY ones):
   - `app/src/components/shell/provider-brand-colors.ts` — brand-mark hex map (AI Hub candy store)
   - `app/src/components/provider-browser/brand-mark.tsx`, `app/src/components/auth/provider-brand-icons.tsx` — full-colour brand marks
   - `app/src/main.tsx` — pre-boot fallback colour before tokens load
   - `app/index.html` + `packages/web/index.html` — the pre-paint theme frame + cache script (light screen `#fcfcfc` / dark gutter `#141416`; keep the two blocks identical)
   - `packages/web/src/new-engine/styles.ts` — entry-chunk boot-gate styles (render before any token CSS loads; gate surfaces mirror the same frame values)
   - the effects layer — aurora / glass-sheen rgba in `ui/core/src/canvas.css`, `.ht-live-glow` + AI-Hub chrome in `app/src/styles/futuristic.css` (sanctioned effect values, not tokenized)
2. **Use `@houston-ai/core` primitives** (§ inventory). Never invent a parallel component; never import another component library. Search core + the shadcn registry before building.
3. **Lucide icons only**, `currentColor`, 20px standard (`h-5 w-5`), 16px small, 24px large, stroke 2px. **No emoji as icons, ever.**
4. **Every screen ships light AND dark** via `[data-theme]`. Pin a subtree with `data-theme="light|dark"` on a wrapper when it must defy the app theme (e.g. the first-run flow pins its calm light setup canvas). Keep the `:not(:where([data-theme="light"], …))` guard on any new dark-scoped descendant rule.
5. **`ui/` (`@houston-ai/*`) stays generic**: props only — no Zustand/store/Tauri imports, no `app/` types, no `@/` aliases. **i18n-agnostic**: take `labels?` props with English defaults; the `app/` consumer passes `t()` results in. No `react-i18next` in `ui/`.
6. **New/changed shared component → bump `design/inventory/inventory.yaml`** + `CHANGELOG.md` + every enforced surface manifest in the SAME PR; run `pnpm check:parity`. Desktop-only chrome is excluded — build in `app/`, don't inventory.
7. No hover-only affordances. Pill buttons (`rounded-full`). No em dashes in user copy. Files ≤200 lines (CSS ≤500).
8. **Responsive: ONE breakpoint, strict mobile-first.** 768px (`breakpoint.mobile` token; Tailwind `md:` is the same edge, pinned by `ui/core/tests/breakpoint-sync.test.ts`) — below is the phone layout, at/above is desktop, no tablet tier, width-based even in the Tauri window. Unprefixed utilities are the PHONE layer, `md:` the desktop layer; never `max-md:`. Convert any file you touch to this convention (progressive, never big-bang; desktop stays pixel-identical). `useIsMobile()` only for structural forks, never layout tweaks. Full-height = `dvh`, never `vh`/`h-screen`/`svh`; fixed top/bottom chrome pads with `pt-safe`/`pb-safe` (safe-area utilities in `ui/core/src/globals.css`). Design BOTH breakpoints for every screen and ship them in the same PR.

## 4. Tokens quick reference
Every value below is a `--ht-*` token, re-exported to Tailwind `--color-*` (use the utility, e.g. `bg-card`, `text-ink`). Never the raw value.

**Type scale** (`scale/typography.json`) — system font stack `ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif`; **no webfonts**. Weights 400 / 500 / 600, plus **510** for the sidebar rail (`font-weight-510`, defined in `ui/core/src/globals.css`): Linear's interface weight, delivered via `font-variation-settings` where the platform font is variable (SF Pro on macOS) and anchored at `font-weight: 500` so a static family (Segoe UI) matches downward instead of overshooting to semibold.

| role | size | weight | Tailwind |
|---|---|---|---|
| h1 / page title | 24px | 400 | `text-2xl font-normal` (what `PageHeader` renders) |
| model selector | 18px | 400 | `text-lg` |
| body / input | 16px | 400 | `text-base` |
| buttons | 14px | 500 | `text-sm font-medium` |
| sidebar rows / band | 13 / 12px | 510 | `text-[13px] font-weight-510` / `text-xs font-weight-510` (`sidebarRowType`) |
| small labels | 12px | 400 | `text-xs` |

Section headers: sentence case, `text-sm font-medium`. Never uppercase / `tracking-wider`.

**Spacing** (`scale/spacing.json`, px): 2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.

**Radius** (`scale/radius.json`): `sm 4` (chips) · `md 6` (inputs) · `lg 8` (sidebar items, icon btns) · `xl 12` (cards) · `xxl 16` (large cards / dialogs) · `composer 28` · `full 9999` (pills, avatars).

**Motion** (`scale/motion.json`): durations `fast 200ms` · `elegant 582ms` · `common 667ms` · `bounce 833ms` · `ambient 32000ms`. Easings `standard [0.25,0.1,0.25,1]` · `entrance [0.16,1,0.3,1]`.

**Elevation** (`scale/elevation.json`): `edge` = `0 1px 0 rgba(0,0,0,0.05)` (default flat depth) · `composer` = the signature multi-shadow. In **dark mode use NO drop shadows** — depth comes from the surface ladder + `.ht-hairline` inset ring + glass sheen.

**Semantic colour roles** (token | use for). Live values: `packages/design-tokens/tokens/*.json`, or component showcase → Colors (`pnpm --filter @houston-ai/showcase dev`).

Surface ladder (bottom → top):
| token / utility | use for |
|---|---|
| `bg-gutter` (`--ht-base`) | window frame / gutter the sidebar melts into |
| `bg-background` (`--ht-background`) | the floating "screen" — **standard main pane** (via `.canvas-screen`) |
| `bg-input` (`--ht-input`) | fields, composer, pills — slightly recessed on the screen |
| `bg-card` (`--ht-card`) | cards/panels that **float above** the canvas |
| `bg-popover` / `bg-dialog` | menus / modals — **SOLID both themes, never blur, never alpha** |
| `bg-chip` / `bg-chip-subtle` | recessed panels below the card tier (board columns, rows) |

Text · interactive · lines:
| token | use for |
|---|---|
| `text-ink` | primary text |
| `text-ink-muted` | secondary text |
| `bg-action` / `text-action-text` | filled CTA fill/label (also progress, tab underline, switches, status dots) |
| `text-link` (+ `bg-link/10` tint) | inline link chips in chat/prose — Slack-blue text on a soft tint, underline on hover; the ONE sanctioned blue |
| `text-bubble-text` | the user chat bubble's text — pure white in BOTH themes (the near-white grays read dull over the bubble fill) |
| `text-prose-text` | the AGENT's long-form chat prose — same as `ink` in light, pure white in dark. Chat only; app primary text stays `text-ink` |
| `bg-hover` / `text-hover-text` | row + menu hover fill |
| `bg-chip` / `text-chip-text` | soft chips / badges |
| `border-line` (`--ht-line`) | hairlines (prefer `.ht-hairline` outline on cards) |
| `border-line-input` | field borders |
| `ring-focus` (`--ht-focus`) | focus ring — **near-ink, NOT blue** |

Status (each has a `-text`): `danger` · `success` · `warning` · `highlight` (brand wash + ink `-text`).

Reserved families — do not reach for outside their home:
- `sidebar*` (`-text`/`-line`/`-hover`/`-active`): sidebar is transparent; `sidebar-active` is the selected-row fill, a clear step above hover.
- `agent.{charcoal,forest,navy,purple,crimson,orange,golden}`: AGENT avatar palette — resolve stored ids via `resolveAgentColor` from `@houston-ai/core`, never app-local helpers. Use `HoustonAvatar`. The same tokens are bridged as `text-agent-*` utilities for the agent's NAME in chat; pick that class with `agentNameToneClass(stored)` (`@houston-ai/core`), which measures the colour against each theme's chat surface and falls back to `text-ink` below 4.5:1 — never hand-write a `text-agent-*` class.
- `filetype.{pdf,doc,sheet,slide,image,video,audio,archive,code,generic}`: FILE-TYPE identity palette — one muted hue per family, themed both ways, worn ONLY by the bare Lucide file glyph (`FileTypeGlyphInline`, `@houston-ai/core` — the Files list rows and chat's file chips) via a `text-filetype-*` utility. Identity like an agent's helmet, never status; folders stay `text-ink-muted`. Contrast against `input`, `background` and `chip-subtle` is guarded by `packages/design-tokens/test/contrast.test.ts`.
- `person-{slate,sage,mauve,taupe,indigo}` + `person-initials` + `person-overflow`/`person-overflow-text`: HUMAN avatar palette (mission face stacks). Deliberately desaturated so teammates never compete with agent helmets. Pick a tone with `personToneClass(id)` from `@houston-ai/board` — never by list index, or a person's colour changes when the roster does.
- `person-name-{slate,sage,mauve,taupe,indigo}`: the same five hues retuned for TEXT (the avatar fills carry white initials and land at ~3:1 as text). One person, one tone: `personNameToneClass(id)` from `@houston-ai/board` indexes the same hash as `personToneClass`. Text-only — never use these as fills.

## 5. Motion rules
Merge the tokenized scale (§4) with these craft rules:
- UI motion **<300ms** (`fast 200ms`) — reserve `elegant 582ms`+ for designated "elegant" moments only.
- **Exits faster than entrances.** Ease-**out** for entrances (`entrance [0.16,1,0.3,1]`); **never ease-in** for UI reveals.
- Animate **only `transform` + `opacity`.** Never layout/color/box-shadow per frame.
- Never from `scale(0)` — start ≥ `scale(0.95)` (see AI-Hub modal: `0.98→1`).
- **NO animation on high-frequency interactions** — menus, dropdowns, keyboard-driven actions open instantly.
- Respect `prefers-reduced-motion`: collapse to opacity-only or static (the aurora already branches on it).
- Gestures / drags → springs, interruptible (Framer `{type:"spring", stiffness:300, damping:30}`); reordering lists use the `layout` prop + `AnimatePresence mode="popLayout"`.

## 6. Banned generic-AI defaults (never produce)
- Indigo/purple gradient on a white page. Houston's colour is chrome-scoped brand aurora, not a hero gradient.
- Centered-hero + three icon feature-cards as a reflex layout.
- Reaching for **Inter / Space Grotesk** as a "safe" font. Houston uses the **system font stack** — adding a webfont to the app is a deliberate design decision, not a default.
- Emoji as section markers or icons (Lucide only).
- Reflexive `01 / 02 / 03` step numbering as decoration.
- `rounded-lg` + 1px gray border card grid as filler chrome (use the flat "plane" row language: transparent rows, `hover:bg-hover`).
- `transition: all`.
- **Drop shadows in dark mode** — use the surface ladder + `.ht-hairline` + glass sheen.
- Decorative colour on content. Colour must be semantic (status/link) or a sanctioned brand mark.

## 7. Polish checklist (pro-tells — apply before "done")
- **Concentric radii**: outer radius = inner radius + padding. Nested corners must be visually parallel.
- `tabular-nums` on any updating or column-aligned numbers.
- `text-wrap: balance` on headings.
- Press feedback ~`scale(0.96)` on primary tap targets.
- **Design every state**: empty / sparse / error / loading for every view. Skeletons mirror the final layout (no CLS). Use `Empty` + `Skeleton` from core.
- Inputs ≥ **16px** font (prevents mobile zoom, reads as intentional).
- **Visible focus**: ≥2px, ≥3:1 contrast, box-shadow style that respects the element radius (`ring-focus`).
- **WCAG**: 4.5:1 body text, 3:1 large text + UI boundaries; hit targets ≥24px (prefer ≥44px for primary).
- Virtualize lists > 50 items.
- **Never block paste.**

## 8. Process (mandatory for UI tasks)
1. Load THIS file first, plus the existing components of the surface it touches.
2. **New surface/screen** → generate **3–5 genuinely distinct** design directions, judge them, pin the winner before building → `skills/frontend-design/SKILL.md`.
3. **Never self-review the look.** Design judgment is Julian's alone — show him. No `/design-review` screenshot loops.
4. Scoped checks only (biome + your vitest); run **`pnpm check:parity`** whenever a shared/`ui/` component changed.

## Component inventory (`@houston-ai/core` — the primitive lock)
accordion · agent-avatar · alert · alert-dialog · async-button · avatar · badge · button · button-group · card · carousel · catalog · catalog-add-button · catalog-detail-dialog · catalog-row · catalog-shell · collapsible · command · confirm-dialog · context-menu · dialog · dropdown-menu · empty · error-boundary · highlighted-text · houston-avatar · hover-card · input · input-group · input-otp · kbd · model-picker · popover · progress · resizable · scroll-area · select · separator · sheet · sidebar · skeleton · sonner · spinner · status-badge · stepper · switch · tabs · textarea · toast-container · tooltip · verified-badge.
Cross-surface product components (chat cards, board, files, etc.) live in `design/inventory/inventory.yaml` (the versioned contract) + `@houston-ai/{chat,board,agent,…}`.
