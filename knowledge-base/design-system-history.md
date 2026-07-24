# Design System — History (superseded)

**What this is:** the pre-futuristic **monochrome "ChatGPT-like" doctrine** that
governed Houston's look before the futuristic-theme brand refactor. It is kept
for archaeology only — **none of it is current**. The current design system is
`knowledge-base/design-system.md` (deep narrative) and `/DESIGN.md` (compact
agent spec); the design tokens in `packages/design-tokens/tokens/*.json` are the
source of truth. Superseded on an unknown date (the futuristic theme landed as
`app/src/styles/futuristic.css`, imported last so its token overrides win).

Read this ONLY to understand where a value came from or why an old commit looks
the way it does. Do NOT copy anything here into new code — the hex literals,
`gray-*` class names, and `rgba(13,13,13,X)` borders below are all replaced by
semantic `--ht-*` tokens (Tailwind `--color-*` utilities). Several values here
are also just **wrong** relative to today's tokens (noted inline).

---

## The transition banner (the bridge artifact)

For a while `design-system.md` opened with this warning, layering the futuristic
theme on top of the monochrome doctrine while both coexisted in one doc:

> **⚠️ Updated — the desktop app now ships the "futuristic" theme**, a deliberate
> brand-direction refactor layered into `app/src/styles/futuristic.css` (imported
> last so its token overrides win). It intentionally overrides much of the
> monochrome guidance below: an aurora glow + glass surfaces in **dark**, a cool
> solid "Aurora" palette in **light**, an Arc/Zen "canvas" layout, and a seamless
> macOS overlay title bar. The grayscale / "never decorative colour" / "light
> mode only" notes below are kept for history, but the futuristic layer is the
> current source of truth.

That two-era split is what this history file resolves: the current doc is now
futuristic-only, and the superseded monochrome content lives here.

---

## Original visual language

> Visual language: ChatGPT-like. Near-black primary, monochrome, clean
> typography, minimal chrome.

**Light mode only.** The monochrome era shipped a single light palette; dark
mode did not exist. (Both themes ship now via `[data-theme]`.)

**"Never decorative colour"** was absolute — colour was banned everywhere, on
chrome as well as content. (The futuristic theme rescoped this to *content*
surfaces only; chrome now carries deliberate brand colour — aurora, glass sheen,
running-card glow.)

## Grays (the old neutral ladder)

The monochrome palette was a hand-authored gray ramp, referenced as `gray-*`
Tailwind utilities:

`gray-50 #f9f9f9` (sidebar bg) · `100 #ececec` (hover, user bubble) ·
`200 #e3e3e3` (pressed, dividers) · `300 #cdcdcd` (borders) · `400 #b4b4b4`
(disabled) · `500 #9b9b9b` (placeholder) · `600 #676767` (secondary text) ·
`700 #424242` (body) · `950 #0d0d0d` (primary text + buttons).

**These no longer match the shipped neutral primitives.** Today's neutrals are
e.g. `neutral.50 #fcfcfc`, `neutral.150 #e5e5e5`, `neutral.500 #8e8e8e` (see
`packages/design-tokens/tokens/primitive/color.json`) — different hexes, and
reached through semantic `--ht-*` tokens, never a `gray-*` literal.

## Borders (old opacity ladder)

> 5%/15%/15%/25% = light/medium/heavy/xheavy. Use `rgba(13,13,13,X)`.

Hardcoded near-ink alpha for every hairline. **Replaced** by the `--ht-line` /
`--ht-line-input` tokens and the `.ht-hairline` inset-ring utility. The
"invisible borders" *principle* (very low opacity, 5–15%) survives in the
current doc; the raw `rgba(13,13,13,X)` recipe does not.

## Buttons (old monochrome class recipes)

Pill shape everywhere (`rounded-full`) — that part survives. The colour recipes
were raw `gray-*` / hex utilities:

- **Primary:** `bg-gray-950 text-white rounded-full h-9 px-3 text-sm font-medium hover:bg-gray-800`
- **Secondary:** `bg-white text-gray-950 rounded-full h-9 px-3 border border-black/15 hover:bg-gray-50`
- **Ghost:** `bg-transparent rounded-lg w-9 h-9 hover:bg-[#f3f3f3]`
- **Soft chip:** `bg-gray-100 rounded-full h-9 px-3 hover:bg-gray-200`
- **Large:** `h-11 px-4`

**Replaced** by token-driven variants on the `Button` primitive
(`bg-action`/`text-action-text`, `bg-input`+`border-line`, `bg-chip`,
`bg-hover`). Never hardcode a `gray-*` or `bg-[#…]` button fill.

## Messages (old user bubble)

- **User:** `ml-auto max-w-[70%] rounded-3xl bg-[#f4f4f4] px-5 py-2.5`
- **Assistant:** no bubble. Plain markdown, left-aligned, transparent.

The assistant-has-no-bubble rule survives. The user bubble's hardcoded
`bg-[#f4f4f4]` was **replaced** by a soft `bg-chip` token fill.

## Composer / cards (old literal phrasings)

The signature composer (`max-w-3xl rounded-[28px] … p-2.5` + the multi-shadow)
and card grammar survive, but the old prose described surfaces as literal
`bg-white` / `border-black/5` / `bg-[#f4f4f4]`. Current guidance routes every one
of those through a token (`bg-input`, `bg-card`, `border-line`).

## Layout chrome (old fixed tones)

- **Sidebar** was `#f5f5f5`, a solid light-gray panel. It is now **transparent**
  and melts into the window gutter (`bg-gutter`, `--ht-base`) — the Arc/Zen
  canvas layout.
- The **main pane** was variously described as `#fbfbfb` / `#f5f5f5`. The shipped
  standard pane is `bg-background` (`--ht-background` = `neutral.50` = `#fcfcfc`
  in light) rendered via the `.canvas-screen` class.

## Status colours (unchanged carry-over)

The monochrome era already allowed semantic status colour, and the values
carried forward: `success #00a240` · `warning #e0ac00` · `danger #e02e2a` (plus
`info #0169cc`, since folded into links/highlight). These remain live tokens —
listed here only because they predate the futuristic refactor.
