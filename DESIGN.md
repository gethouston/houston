# DESIGN.md — Houston UI spec (load before ANY UI work)

## 1. What this file is
Mandatory context for every coding agent (Claude Code / Codex) before touching UI. Distills the canonical sources into rules you can hold in context.
Canonical sources, in precedence order: `packages/design-tokens/tokens/*.json` (source of truth — **tokens win on any conflict**) › this file (the doctrine). If this file disagrees with the token JSON, the JSON is right — fix this file.

## 2. Product design identity
Houston is a calm, futuristic desktop AI product — "quiet expert," not flashy, not corporate. Current look = the **futuristic theme**: the shared canvas `ui/core/src/canvas.css` (aurora, glass surfaces, depth utilities — imported after core globals so its overrides win; also consumed by the store playground and, eventually, agents.gethouston.ai) plus the app-only chrome left in `app/src/styles/futuristic.css` (AI-Hub `.ht-live-glow` and onboarding effects).
- **Arc / Zen "canvas" layout.** Main content floats as a rounded "screen" card (`bg-background`, `.canvas-screen`) on a recessed window **gutter** (`bg-gutter`); the sidebar is transparent and melts into the gutter.
- **Dark mode is the loved baseline** — a slow-drifting multi-radial **aurora glow** (blue/indigo/orange, 32s) on `body::before` + translucent **glass** surfaces with `backdrop-filter` blur.
- **Light mode** — cool solid light palette (gutter, screen, and slightly recessed fields), no glow mesh (read as glitter over solids). Clean by restraint. ("Aurora" refers ONLY to the dark-mode glow — themes are just "light" and "dark".)
- **Near-monochrome content, brand-coloured chrome.** Text/controls stay grayscale; colour lives in chrome (aurora, glass sheen, running-card glow) + semantic status + agent avatars + links. Never decorative colour on content surfaces.
- Both themes ship on every screen via `[data-theme]`. Floating surfaces (modals, popovers) are **solid** in both themes — never glass, never bleed content.

**Palettes.** Mode and palette are two axes. `[data-theme]` is the resolved mode; `[data-palette="<id>"]` picks one of twelve colour sets. **Houston Light** and **Houston Dark** are the defaults and the authored source of truth: they are the identity above, and every other set is an import. The ten imports are vendored Omarchy themes (Catppuccin, Nord, Gruvbox, Everforest, Tokyo Night, Flexoki, Rosé Pine Dawn, Lupine, White) derived by RULE into the full `--ht-*` set, never hand-tuned: the ladder's structure, the alpha washes and the contrast floors are Houston's, the hexes are the palette's except the status family and links, which stay Houston's because status is semantics rather than surface (a palette whose red, green and yellow are grays would otherwise have no danger, success, warning or link at all) and are re-measured on the palette's surfaces, and an import wears its own accent as `action` and `focus` (the Houston sets keep the ink CTA of the identity above). So every screen looks right in every palette for the same reason it looks right in both themes, and design work targets the Houston sets only. The rules live in `docs/adr/0004-palette-library.md`; a palette needing a hand-written value means the rule is wrong.

## 3. Hard rules (non-negotiable)
1. **Semantic tokens only. Never a raw hex/rgba/px literal** in `app/` or `ui/`. A visual change is a token edit (`packages/design-tokens/tokens/*.json`), never a hardcoded value. Sanctioned raw-hex exceptions (the ONLY ones):
   - `app/src/components/shell/provider-brand-colors.ts` — brand-mark hex map (AI Hub candy store)
   - `app/src/components/provider-browser/brand-mark.tsx`, `app/src/components/auth/provider-brand-icons.tsx` — full-colour brand marks
   - `ui/chat/src/channel-brand-colors.ts` — the messaging channels' official brand colours (Slack, Telegram): a logo's colour is the logo
   - `app/src/main.tsx` — pre-boot fallback colour before tokens load
   - `app/index.html` + `packages/web/index.html` — the pre-paint theme frame + cache script (light screen `#fcfcfc` / dark gutter `#141416`; keep the two blocks identical)
   - `packages/web/src/new-engine/styles.ts` — entry-chunk boot-gate styles (render before any token CSS loads; gate surfaces mirror the same frame values)
   - the effects layer — aurora / glass-sheen rgba in `ui/core/src/canvas.css`, `.ht-live-glow` + onboarding effects in `app/src/styles/futuristic.css` (sanctioned effect values, not tokenized)
   - `ui/showcase/specimens/foundations/effects-parts.ts` — the showcase specimen documenting that effects layer's authored values; it mirrors `canvas.css`, which wins any disagreement
   - `ui/core/src/color-contrast.ts` — the colour maths: it parses and formats every colour form, so the format strings live there and nowhere else
   - `agentstore/src/lib/og-card.tsx` — the social share image: a rendered PNG with its own art direction, drawn by next/og without CSS variables
2. **Use `@houston-ai/core` primitives** (§ inventory). Never invent a parallel component; never import another component library. Search core + the shadcn registry before building.
3. **Lucide icons only**, `currentColor`, 20px standard (`h-5 w-5`), 16px small, 24px large, stroke 2px. **No emoji as icons, ever.**
4. **Every screen ships light AND dark** via `[data-theme]`. Pin a subtree with `data-theme="light|dark"` on a wrapper when it must defy the app theme (e.g. the first-run flow pins its calm light setup canvas). Keep the `:not(:where([data-theme="light"], …))` guard on any new dark-scoped descendant rule.
5. **`ui/` (`@houston-ai/*`) stays generic**: props only — no Zustand/store/Tauri imports, no `app/` types, no `@/` aliases. **i18n-agnostic**: take `labels?` props with English defaults; the `app/` consumer passes `t()` results in. No `react-i18next` in `ui/`.
6. **New/changed shared component → bump `design/inventory/inventory.yaml`** + `CHANGELOG.md` + every enforced surface manifest in the SAME PR; run `pnpm check:parity`. Desktop-only chrome is excluded — build in `app/`, don't inventory.
7. No hover-only affordances. Pill buttons (`rounded-full`). No em dashes in user copy. Files ≤200 lines (CSS ≤500).
8. **Responsive: ONE breakpoint, strict mobile-first.** 768px (`breakpoint.mobile` token; Tailwind `md:` is the same edge, pinned by `ui/core/tests/breakpoint-sync.test.ts`) — below is the phone layout, at/above is desktop, no tablet tier, width-based even in the Tauri window. Unprefixed utilities are the PHONE layer, `md:` the desktop layer; never `max-md:`. Convert any file you touch to this convention (progressive, never big-bang; desktop stays pixel-identical). `useIsMobile()` only for structural forks, never layout tweaks. Full-height = `dvh`, never `vh`/`h-screen`/`svh`; fixed top/bottom chrome pads with `pt-safe`/`pb-safe` (safe-area utilities in `ui/core/src/globals.css`). Design BOTH breakpoints for every screen and ship them in the same PR.
   The ONE sanctioned exception: `DialogContent`/`Sheet` cap their width at `sm:` (their base `max-w-[calc(100%-2rem)]` is the phone gutter). A caller sizing a dialog MUST write `sm:max-w-*` — an unprefixed `max-w-*` is tailwind-merged over the base cap and the dialog goes edge-to-edge on phones.

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

**Radius** (`scale/radius.json`): `sm 4` (chips) · `md 6` (inputs) · `lg 8` (sidebar items, icon btns) · `xl 12` (cards) · `xxl 16` (large cards, every dialog) · `composer 28` · `full 9999` (pills, avatars).
Every dialog surface wears `xxl` (`rounded-2xl`): `Dialog` and `AlertDialog` share it through `DIALOG_CONTENT_CLASS` (`ui/core/src/components/dialog-frame.ts`, pinned by `ui/core/tests/dialog-frame.test.ts`), so a confirm, a form and a flow step have the same corner. A caller does not pass a `rounded-*` class to a dialog's content: the frame owns the radius.

**Motion** (`scale/motion.json`): durations `fast 200ms` · `elegant 582ms` · `common 667ms` · `bounce 833ms` · `ambient 32000ms`. Easings `standard [0.25,0.1,0.25,1]` · `entrance [0.16,1,0.3,1]`.

**Elevation** (`semantic/elevation.{light,dark}.json` → `--ht-shadow-*`, one themed value per tier, so a utility needs no `dark:` fork): `shadow-edge` (default flat depth) · `shadow-field` / `focus-within:shadow-field-focus` (composer, inputs) · `shadow-card` (floating card) · `shadow-raised` (sign-in card) · `shadow-drag` (the board's drag ghost, read as `var(--ht-shadow-drag)`) · `shadow-dialog`, worn by the ONE modal frame as `.ht-shadow-dialog` (`canvas.css`). The tiers are the ONLY drop shadows dark mode carries: outside them, dark depth is the surface ladder + `.ht-hairline` inset ring + glass sheen. A tier's dark value may also hold that sheen as an inset layer (the `dialog` tier opens with it), because a separate `[data-theme="dark"]` sheen rule would REPLACE the tier rather than add to it; box-shadow does not accumulate across rules.

**Semantic colour roles** (token | use for). Live values: `packages/design-tokens/tokens/*.json`, or component showcase → Colors (`pnpm --filter @houston-ai/showcase dev`).

Every role below is re-declared per palette under `[data-palette="<id>"]`, and the library itself (id, display name, mode, four swatch hexes) is the `palettes` export with its `PaletteId` type from `@houston/design-tokens`. A palette is applied by setting that attribute; never by overriding a `--ht-*` at a call site.

Surface ladder (bottom → top):
| token / utility | use for |
|---|---|
| `bg-gutter` (`--ht-base`) | window frame / gutter the sidebar melts into |
| `bg-background` (`--ht-background`) | the floating "screen" — **standard main pane** (via `.canvas-screen`) |
| `bg-pane` (`--ht-pane`) | a chat pane's own header/footer chrome: the screen tone in light, nothing in dark so the glass shows through |
| `bg-input` (`--ht-input`) | fields, composer, pills — slightly recessed on the screen |
| `bg-field` / `hover:bg-field-hover` (`--ht-field`) | a CONTROL's resting and hover fill (outline button, active tab pill): `input` in light, the field-border wash in dark |
| `bg-card` (`--ht-card`) | cards/panels that **float above** the canvas |
| `bg-card-solid` (`--ht-card-solid`) | the board's resting cards and its "+" bar: opaque, the screen tone in both themes so a card reads as the screen showing through the column tray, never glass (a board of blurred cards is muddy and a GPU cost) |
| `bg-popover` / `bg-dialog` | menus / modals — **SOLID both themes, never blur, never alpha** |
| `bg-chip` / `bg-chip-subtle` | recessed panels below the card tier (board columns, rows) |

Text · interactive · lines:
| token | use for |
|---|---|
| `text-ink` | primary text |
| `text-ink-muted` | secondary text |
| `bg-action` / `text-action-text` | filled CTA fill/label (also progress, tab underline, switches, status dots) |
| `bg-cta` / `text-cta-text` (+ `cta-hover`, `cta-rim`, `cta-rim-hover`) | the filled primary Button's own pair — Houston: near-ink solid in light, white frost in dark; an import: a solid accent pill in light, an accent-tinted frost pill in dark — distinct from `action`, which also paints progress, switches and status dots. Worn by `canvas.css` §4, never by a call site |
| `text-link` (+ `bg-link/10` tint) | inline link chips in chat/prose — Slack-blue text on a soft tint, underline on hover; the ONE sanctioned blue, in EVERY palette: an import inherits this hue and re-measures it on its own surfaces, because a link is semantics (ADR 0004) |
| `bg-bubble` | the user chat bubble's fill — near-ink in light, the subtle white wash in dark |
| `text-bubble-text` | the user chat bubble's text — pure white in BOTH themes (the near-white grays read dull over the bubble fill) |
| `bg-bubble-chip` / `text-bubble-chip-text` | a chip INSIDE the user bubble (mention, link) — measured against the bubble, not the canvas |
| `text-prose-text` | the AGENT's long-form chat prose — same as `ink` in light, pure white in dark. Chat only; app primary text stays `text-ink` |
| `bg-hover` / `text-hover-text` | row + menu hover fill |
| `bg-chip` / `text-chip-text` | soft chips / badges |
| `border-line` (`--ht-line`) | hairlines (prefer `.ht-hairline` outline on cards) |
| `border-line-input` | field borders |
| `ring-focus` (`--ht-focus`) | focus ring — **near-ink, NOT blue** in Houston's own sets, while an imported palette wears its accent here (ADR 0004) |

Status: `danger` · `success` · `warning` · `highlight` (brand wash). Each has a `-text` (the label ON the fill) and an `-ink` (the hue AS text on a surface: `text-danger-ink` / `text-success-ink` / `text-warning-ink`, contrast-guarded against `input`, `background` and `chip-subtle` in both themes by `packages/design-tokens/test/contrast.test.ts`). A fill is tuned to carry its `-text`, so it does NOT clear 4.5:1 as text: never set a status fill as a text colour. `highlight`'s `-text` is already that ink.
Destructive chrome carries its own pair so no `dark:` fork exists: `bg-danger-fill` (the destructive button/badge fill, softened to 60% in dark) and `ring-danger-ring` (the invalid / destructive focus ring, 20% light and 40% dark).

Reserved families — do not reach for outside their home:
- `sidebar*` (`-text`/`-line`/`-hover`/`-active`): sidebar is transparent; `sidebar-active` is the selected-row fill, a clear step above hover.
- `agent.{charcoal,forest,navy,purple,crimson,orange,golden}`: AGENT avatar palette — resolve stored ids via `resolveAgentColor` from `@houston-ai/core`, never app-local helpers. Use `HoustonAvatar`. The same tokens are bridged as `text-agent-*` utilities for the agent's NAME in chat; pick that class with `agentNameToneClass(stored)` (`@houston-ai/core`), which measures the colour against each theme's chat surface and falls back to `text-ink` below 4.5:1 — never hand-write a `text-agent-*` class. The employee ID badge extends this semantic identity to its photo panel and body: a 160px engraved metal header above the existing 5% body wash on `card-solid` and `input` fields. `scale/employee-metal.json` owns alloy mixing ratios (top 40%, bottom 30%, relief 25%, sheen 8%, engraving 5%, control 10%, highlight 12%); `employee-metal-light` and `employee-metal-shade` supply the neutral alloy anchors in both themes. `HoustonAvatar` wears the same metal as a disc: the 135deg top-to-bottom surface, the helmet in relief, a 12% light inset line along its top edge and no engraving; a colourless avatar wears it in `ink-muted`. The recipe lives once in `employeeMetalColors` (`@houston-ai/core`), which the badge also uses, so badge and avatar cannot drift. A diagonal sheen, seeded fine contours and an unblurred light-edge helmet relief replace the portrait plate; the corner Paintbrush control is 44px on phone and 32px on desktop. It uses the same themed palette, never a separate color set; paint crossfades with `duration.fast`, instantly under reduced motion.
- `filetype.{pdf,doc,sheet,slide,image,video,audio,archive,code,generic}`: FILE-TYPE identity palette — one muted hue per family, themed both ways, worn ONLY by the bare Lucide file glyph (`FileTypeGlyphInline`, `@houston-ai/core` — the Files list rows and chat's file chips) via a `text-filetype-*` utility. Identity like an agent's helmet, never status; folders stay `text-ink-muted`. Contrast against `input`, `background` and `chip-subtle` is guarded by `packages/design-tokens/test/contrast.test.ts`.
- `person-{slate,sage,mauve,taupe,indigo}` + `person-initials` + `person-overflow`/`person-overflow-text`: HUMAN avatar palette (mission face stacks). Deliberately desaturated so teammates never compete with agent helmets. Pick a tone with `personToneClass(id)` from `@houston-ai/board` — never by list index, or a person's colour changes when the roster does.
- `glow-{blue,indigo,orange,amber}` + `glow-blue-wash`/`glow-blue-shadow`: the running comet (card glow, avatar ring, progress line), theme-invariant, consumed only by the `.card-running-glow` / `.avatar-running-ring` / `.running-glow-line` recipes in `ui/core/src/motion.css`; never as decorative colour elsewhere.
- `flash`: the routines section flash wash (`ui/routines`), a white alpha in both themes.
- `person-name-{slate,sage,mauve,taupe,indigo}`: the same five hues retuned for TEXT (the avatar fills carry white initials and land at ~3:1 as text). One person, one tone: `personNameToneClass(id)` from `@houston-ai/board` indexes the same hash as `personToneClass`. Text-only — never use these as fills.

## 5. Motion rules
Merge the tokenized scale (§4) with these craft rules:
- UI motion **<300ms** (`fast 200ms`) — reserve `elegant 582ms`+ for designated "elegant" moments only.
- **Exits faster than entrances.** Ease-**out** for entrances (`entrance [0.16,1,0.3,1]`); **never ease-in** for UI reveals.
- Animate **only `transform` + `opacity`.** Never layout/color/box-shadow per frame.
- Never from `scale(0)` — start ≥ `scale(0.95)` (see `zoom-in-95` in `dialog-frame.ts`).
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
- **An ad-hoc drop shadow in dark mode.** Dark depth is the surface ladder + `.ht-hairline` + glass sheen; the only dark drop shadows are the elevation tiers (§4), which carry their dark values in the token. Wear a tier, never a new shadow of your own.
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
accordion · agent-avatar · alert · alert-dialog · async-button · avatar · badge · button · button-group · card · carousel · catalog · catalog-add-button · catalog-detail-dialog · catalog-row · catalog-search-field · catalog-shell · collapsible · command · confirm-dialog · context-menu · dialog · dropdown-menu · empty · error-boundary · file-type-icons · floating-nav-bar · flow-choice-row · flow-sheet · form-dialog · highlighted-text · houston-avatar · hover-card · input · input-group · input-otp · kbd · model-picker · popover · progress · resizable · responsive-popover · scroll-area · search-clear-button · select · separator · sheet · sidebar · skeleton · sonner · spinner · status-badge · switch · tabs · textarea · toast-container · tooltip · verified-badge.
Cross-surface product components (chat cards, board, files, etc.) live in `design/inventory/inventory.yaml` (the versioned contract) + `@houston-ai/{chat,board,agent,…}`.
