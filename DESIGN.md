# DESIGN.md — Houston UI spec (load before ANY UI work)

## 1. What this file is
Mandatory context for every coding agent (Claude Code / Codex) before touching UI. Distills the canonical sources into rules you can hold in context.
Canonical sources, in precedence order: `packages/design-tokens/tokens/*.json` (source of truth — **tokens win on any conflict**) › `knowledge-base/design-system.md` (current-state doctrine) › this file (summary). If this file disagrees with the token JSON, the JSON is right — fix this file.

## 2. Product design identity
Houston is a calm, futuristic desktop AI product — "quiet expert," not flashy, not corporate. Current look = the **futuristic theme** (`app/src/styles/futuristic.css`, imported last so its overrides win).
- **Arc / Zen "canvas" layout.** Main content floats as a rounded "screen" card (`bg-background`, `.canvas-screen`) on a recessed window **gutter** (`bg-gutter`); the sidebar is transparent and melts into the gutter.
- **Dark mode is the loved baseline** — a slow-drifting multi-radial **aurora glow** (blue/indigo/orange, 32s) on `body::before` + translucent **glass** surfaces with `backdrop-filter` blur.
- **Light mode** — cool solid **"Aurora" palette** (gutter `#eef1f7`, screen `#fcfcfc`, cards over it), no glow mesh (read as glitter over solids). Clean by restraint.
- **Near-monochrome content, brand-coloured chrome.** Text/controls stay grayscale; colour lives in chrome (aurora, glass sheen, running-card glow) + semantic status + agent avatars + links. Never decorative colour on content surfaces.
- Both themes ship on every screen via `[data-theme]`. Floating surfaces (modals, popovers) are **solid** in both themes — never glass, never bleed content.

## 3. Hard rules (non-negotiable)
1. **Semantic tokens only. Never a raw hex/rgba/px literal** in `app/` or `ui/`. A visual change is a token edit (`packages/design-tokens/tokens/*.json`), never a hardcoded value. Sanctioned raw-hex exceptions (the ONLY ones):
   - `app/src/components/shell/provider-brand-colors.ts` — brand-mark hex map (AI Hub candy store)
   - `app/src/components/provider-browser/brand-mark.tsx`, `app/src/components/auth/provider-brand-icons.tsx` — full-colour brand marks
   - `app/src/main.tsx` — pre-boot fallback colour before tokens load
   - `futuristic.css` effects layer — aurora / `.ht-live-glow` / glass-sheen rgba (sanctioned effect values, not tokenized)
2. **Use `@houston-ai/core` primitives** (§ inventory). Never invent a parallel component; never import another component library. Search core + the shadcn registry before building.
3. **Lucide icons only**, `currentColor`, 20px standard (`h-5 w-5`), 16px small, 24px large, stroke 2px. **No emoji as icons, ever.**
4. **Every screen ships light AND dark** via `[data-theme]`. Pin a subtree with `data-theme="light|dark"` on a wrapper when it must defy the app theme (e.g. controls on the dark space backdrop). Keep the `:not(:where([data-theme="light"], …))` guard on any new dark-scoped descendant rule.
5. **`ui/` (`@houston-ai/*`) stays generic**: props only — no Zustand/store/Tauri imports, no `app/` types, no `@/` aliases. **i18n-agnostic**: take `labels?` props with English defaults; the `app/` consumer passes `t()` results in. No `react-i18next` in `ui/`.
6. **New/changed shared component → bump `design/inventory/inventory.yaml`** + `CHANGELOG.md` + every enforced surface manifest in the SAME PR; run `pnpm check:parity`. Desktop-only chrome is excluded — build in `app/`, don't inventory.
7. No hover-only affordances. Pill buttons (`rounded-full`). No em dashes in user copy. Files ≤200 lines (CSS ≤500).

## 4. Tokens quick reference
Every value below is a `--ht-*` token, re-exported to Tailwind `--color-*` (use the utility, e.g. `bg-card`, `text-ink`). Never the raw value.

**Type scale** (`scale/typography.json`) — system font stack `ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, Arial, sans-serif`; **no webfonts**. Weights 400 / 500 / 600.

| role | size | weight | Tailwind |
|---|---|---|---|
| h1 / page title | 28px | 400 | `text-[28px] font-normal` |
| model selector | 18px | 400 | `text-lg` |
| body / input | 16px | 400 | `text-base` |
| buttons | 14px | 500 | `text-sm font-medium` |
| sidebar / small labels | 14 / 12px | 400 | `text-sm` / `text-xs` |

Section headers: sentence case, `text-sm font-medium`. Never uppercase / `tracking-wider`.

**Spacing** (`scale/spacing.json`, px): 2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.

**Radius** (`scale/radius.json`): `sm 4` (chips) · `md 6` (inputs) · `lg 8` (sidebar items, icon btns) · `xl 12` (cards) · `xxl 16` (large cards / dialogs) · `composer 28` · `full 9999` (pills, avatars).

**Motion** (`scale/motion.json`): durations `fast 200ms` · `elegant 582ms` · `common 667ms` · `bounce 833ms` · `ambient 32000ms`. Easings `standard [0.25,0.1,0.25,1]` · `entrance [0.16,1,0.3,1]`.

**Elevation** (`scale/elevation.json`): `edge` = `0 1px 0 rgba(0,0,0,0.05)` (default flat depth) · `composer` = the signature multi-shadow. In **dark mode use NO drop shadows** — depth comes from the surface ladder + `.ht-hairline` inset ring + glass sheen.

**Semantic colour roles** (token | light → dark | use for):

Surface ladder (bottom → top):
| token / utility | light → dark | use for |
|---|---|---|
| `bg-gutter` (`--ht-base`) | `#eef1f7` → `#141416` | window frame / gutter the sidebar melts into |
| `bg-background` (`--ht-background`) | `#fcfcfc` → glass `rgba(38,38,40,.55)` | the floating "screen" — **standard main pane** (via `.canvas-screen`) |
| `bg-input` (`--ht-input`) | `#ffffff` → `#1e1e1e` | floating white inputs, composer, pills |
| `bg-card` (`--ht-card`) | glass `white-68` → glass `neutral-50` | cards/panels that **float above** the canvas |
| `bg-popover` / `bg-dialog` | white → `#1e1e1e` | menus / modals — **SOLID both themes, never blur, never alpha** |
| `bg-chip` / `bg-chip-subtle` | `ink-a035` → `white-a05` | recessed panels below the card tier (board columns, rows) |

Text · interactive · lines:
| token | light → dark | use for |
|---|---|---|
| `text-ink` | `#14161d` → `#e5e5e5` | primary text |
| `text-ink-muted` | `#8e8e8e` → neutral-450 | secondary text |
| `bg-action` / `text-action-text` | `#0d0d0d`/white → `#e5e5e5`/`#171717` | filled CTA fill/label (also progress, tab underline, switches, status dots) |
| `bg-hover` / `text-hover-text` | `#fcfcfc`→ / white-a08 | row + menu hover fill |
| `bg-chip` / `text-chip-text` | soft fill | soft chips / badges |
| `border-line` (`--ht-line`) | `rgba(60,70,120,.1)` → white-a10 | hairlines (prefer `.ht-hairline` outline on cards) |
| `border-line-input` | `#e3e3e3` → neutral-700 | field borders |
| `ring-focus` (`--ht-focus`) | `#0d0d0d` → `#e5e5e5` | focus ring — **near-ink, NOT blue** |

Status (each has a `-text`): `danger` `#e02e2a`→`#ef4444` · `success` `#00a240`→`#22c55e` · `warning` `#e0ac00`→`#eab308` · `highlight` (brand wash + ink `-text`).

Reserved families — do not reach for outside their home:
- `sidebar*` (`-text`/`-line`/`-hover`/`-active`): sidebar is transparent; `sidebar-active` is the selected-row fill, a clear step above hover.
- `space-*`: theme-invariant **dark**, ONLY for the workspace-loading splash / `OrbitLoader` / storage-unavailable gate (`app/src/components/space/`). Any themed control placed on it must pin `data-theme="dark"`.
- `agent.{charcoal,forest,navy,purple,crimson,orange,golden}`: AGENT avatar palette — resolve stored ids via `resolveAgentColor` from `@houston-ai/core`, never app-local helpers. Use `HoustonAvatar`.
- `person-{slate,sage,mauve,taupe,indigo}` + `person-initials` + `person-overflow`/`person-overflow-text`: HUMAN avatar palette (mission face stacks). Deliberately desaturated so teammates never compete with agent helmets. Pick a tone with `personToneClass(id)` from `@houston-ai/board` — never by list index, or a person's colour changes when the roster does.

## 5. Motion rules
Merge the tokenized scale (§4) with these craft rules:
- UI motion **<300ms** (`fast 200ms`) — reserve `elegant 582ms`+ for designated "elegant" moments only.
- **Exits faster than entrances.** Ease-**out** for entrances (`entrance [0.16,1,0.3,1]`); **never ease-in** for UI reveals.
- Animate **only `transform` + `opacity`.** Never layout/color/box-shadow per frame.
- Never from `scale(0)` — start ≥ `scale(0.95)` (see AI-Hub modal: `0.98→1`).
- **NO animation on high-frequency interactions** — menus, dropdowns, keyboard-driven actions open instantly.
- Respect `prefers-reduced-motion`: collapse to opacity-only or static (the aurora + OrbitLoader already branch on it).
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
1. Load THIS file first, plus `knowledge-base/design-system.md` for the surface it touches.
2. **New surface/screen** → generate **3–5 genuinely distinct** design directions, judge them, pin the winner before building → `skills/frontend-design/SKILL.md`.
3. Before declaring done → run the screenshot self-critique loop → `skills/design-review/SKILL.md`.
4. Scoped checks only (biome + your vitest); run **`pnpm check:parity`** whenever a shared/`ui/` component changed.

## Component inventory (`@houston-ai/core` — the primitive lock)
accordion · agent-avatar · alert · alert-dialog · async-button · avatar · badge · button · button-group · card · carousel · catalog · catalog-detail-dialog · catalog-row · catalog-shell · collapsible · command · confirm-dialog · context-menu · dialog · dropdown-menu · empty · error-boundary · highlighted-text · houston-avatar · hover-card · input · input-group · input-otp · kbd · model-picker · popover · progress · resizable · scroll-area · select · separator · sheet · sidebar · skeleton · sonner · spinner · status-badge · stepper · switch · tabs · textarea · toast-container · tooltip · verified-badge.
Cross-surface product components (chat cards, board, files, etc.) live in `design/inventory/inventory.yaml` (the versioned contract) + `@houston-ai/{chat,board,agent,…}`.
