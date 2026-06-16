# Design System

Visual language: ChatGPT-like. Near-black primary, monochrome, clean typography, minimal chrome.

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
Near-black `#0d0d0d`, NEVER pure black. Light mode only for now.

### Grays
`gray-50 #f9f9f9` (sidebar bg) · `100 #ececec` (hover, user bubble) · `200 #e3e3e3` (pressed, dividers) · `300 #cdcdcd` (borders) · `400 #b4b4b4` (disabled) · `500 #9b9b9b` (placeholder) · `600 #676767` (secondary text) · `700 #424242` (body) · `950 #0d0d0d` (primary text + buttons)

### Tokens
`--background #fff` · `--foreground #0d0d0d` · `--secondary #f9f9f9` · `--muted-foreground #5d5d5d` · `--border #e5e5e5` · `--ring #0d0d0d` · `--accent #f5f5f5`

### Borders (opacity)
5%/15%/15%/25% = light/medium/heavy/xheavy. Use `rgba(13,13,13,X)`.

### Status
success `#00a240` · info `#0169cc` · warning `#e0ac00` · danger `#e02e2a`

### Color restraint
UI is grayscale. Color ONLY for:
1. card-running-glow gradient (blue→indigo→orange→yellow)
2. status indicators
3. agent/channel avatars
4. links

Never decorative color.

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
One shared component (`app/src/components/cards/row-card.tsx`) for the compact horizontal cards in chat and integration surfaces: monochrome logo/icon left (`size-8 rounded-lg` media box), `text-[13px]` title + `text-[11px]` muted description, single right-side action slot. Always grey `bg-secondary`, `rounded-xl`, `px-3 py-2.5`. The `inline` prop renders a `<span>` row so it can sit inside assistant markdown prose. Pair with `RowCardButton` (`h-7 rounded-full` pill) — its `icon` is **optional**, so action buttons are text-only by default (only the Composio cards pass a trailing link icon). Provider logos come from `ProviderGlyph` (`shell/provider-logos.tsx`) — monochrome, never full-color brand marks. Used by: reconnect / sign-in (`UnauthenticatedCard`, `ProviderReconnectCard`), rate-limit, the provider-switch dialog, and the Composio sign-in / link cards.

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

## Icons
Lucide React only. 20px standard (`h-5 w-5`), 16px small, 24px large. Stroke 2px (or 1.5px lighter). `currentColor`.

**No emoji as icons.**

## Rules
1. No emoji icons
2. No hover-only affordances
3. Monochrome by default
4. Compact not cramped
5. Animations serve purpose
6. Pill shapes for buttons (`rounded-full`)
7. Brand via tokens only — never hardcode hex

## Design skill workflow
1. `/critique` — before building
2. `/polish` — final alignment/spacing/consistency pass
Use when relevant: `/clarify` (UX copy), `/distill` (overloaded screen), `/animate` (micro-interactions), `/audit` (a11y, perf).
