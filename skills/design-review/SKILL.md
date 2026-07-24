---
name: design-review
description: The screenshot self-critique loop. Run BEFORE declaring ANY Houston UI work done. Screenshot the touched screens in both themes at desktop + narrow widths, critique against a scored rubric with vision, fix the top 3 issues, repeat. Gate: loop passes + scoped checks + parity. Tool-agnostic, Playwright is the default path.
---

# /design-review

You cannot judge UI from code. Look at it. A picture is worth 1000 tokens.

**Never report UI work complete without running this loop.** Minimum 2 passes; plan on 3–5. Stop when a pass finds nothing above severity-minor.

## Precondition

Read **`/DESIGN.md`** (repo root) FIRST — the compact spec that defines the rules this loop scores against (hard rules, token quick-reference, motion, banned defaults). Then **`knowledge-base/design-system.md`** for the deeper narrative on the surface you touched. The `--ht-*` token values live in `packages/design-tokens/tokens/*.json`. This is what "token compliance" and "motion rules" below are measured against.

## The loop

### 1. Bring the surface up

**App screens** (`app/src` / `packages/web`) run against an in-memory **fake host** — no real backend, no AI, no credentials. Two paths:

- **Playwright harness (default, hermetic).** `pnpm --filter houston-web test:e2e` boots both servers itself (vite `:1430` + fake host `:4399`) — write a throwaway spec (or extend one) that navigates the touched screen and calls `page.screenshot(...)`. Fixtures seed a booted shell with one agent selected (`packages/web/e2e/README.md`, `knowledge-base/ui-testing.md`). Arm Teams / integration / board states via the `/__test__/*` controls documented there. There is also a scoped **`/verify`** skill (`houston/packages/web:verify`) that drives host + Playwright flows.
- **Manual, two panes.** Terminal 1: `pnpm --filter houston-web fake-host` (`:4399`). Terminal 2: `pnpm --filter houston-web dev` (vite `:1430`). Then drive a browser — Playwright script, or the Chrome/browser MCP if available — to the touched screen.

**Website** (`website/`, Eleventy — no fake host): `cd website && npm run dev` serves the built site (`--serve`), or `npm run build` then serve `_site/`. Same rubric applies.

### 2. Screenshot — both themes, two widths

For **every** touched screen, capture the matrix:

|            | Desktop (~1280px) | Narrow (~380px) |
|------------|-------------------|-----------------|
| **Light**  | ✓                 | ✓               |
| **Dark**   | ✓                 | ✓               |

Toggle theme by setting `data-theme` on the root element (`app/src/lib/theme.ts` applies it): dark = `document.documentElement.setAttribute("data-theme","dark")`; light = remove the attribute (or set `"light"`). In Playwright: `page.evaluate(...)` then screenshot. Capture any designed **states** (empty / loading / error) too — the fake host `/__test__/*` controls or seed data drive them.

### 3. Critique with vision — score each 1–5

Look at every screenshot and score against this rubric. Any score ≤3 is an issue.

- **Visual hierarchy** — one clear focal point? One obvious action?
- **Spacing rhythm** — token grid respected, no ad-hoc gaps or one-off margins?
- **Token compliance** — any colour/spacing that isn't a `--ht-*` token / Tailwind utility? (No raw hex outside the two sanctioned brand-hex files.)
- **Both-themes parity** — dark isn't a naive inversion; contrast holds; glass/aurora chrome reads right; no dark chrome leaking into a light-pinned subtree.
- **Typography** — type scale respected (design-system.md → Typography), no orphan font sizes, sentence-case section headers.
- **States** — empty / loading / error present AND designed, not afterthoughts.
- **Motion** — obeys design-system.md → Animation (durations, springs, `card-running-glow`); `prefers-reduced-motion` honoured; no gratuitous animation.
- **Accessibility spot-checks** — contrast ≥4.5:1 body / ≥3:1 large + UI; focus visible; hit targets ≥24px; no hover-only affordances.
- **Generic-AI tells** — none of the banned defaults (`/DESIGN.md` → Banned generic-AI defaults + the three AI-cluster looks: cream/serif/terracotta, near-black + acid accent, broadsheet hairlines).
- **The overall question** — *"Does this look like it was designed on purpose?"*

Write the findings down (a scratch note), ranked by severity.

### 4. Fix the TOP 3 issues

Only the worst three this pass. A visual fix is a token/component edit, not a hardcoded literal. Keep changes on the surface ladder and inside the type/spacing scale.

### 5. Repeat

Re-screenshot the full matrix, re-critique. **Minimum 2 passes; stop only when a pass surfaces nothing above severity-minor.**

## Gate — all must hold before "done"

- The loop passes (a clean pass, nothing above minor).
- Scoped checks pass: **`pnpm check`** (biome, on touched paths — `pnpm check:fix` first) + the relevant **vitest / e2e** (`pnpm --filter houston-web test:e2e`, or the touched package's tests).
- **Visual regression** — after UI changes to a key screen (mission board, chat, first-run), run **`pnpm --filter houston-web test:visual`**. When the visual change is intentional, re-record with **`pnpm --filter houston-web test:visual:update`**, eyeball the new PNGs, and commit them in the same PR — never blindly re-record to turn a red run green (`packages/web/e2e/README.md` → Visual regression).
- **`pnpm check:parity`** if a shared cross-surface component changed (with `design/inventory/inventory.yaml` + CHANGELOG bumped in the same change).

Only then report the UI work complete.

## Anti-patterns

- ❌ "The code looks right, shipping it." → You didn't look at it.
- ❌ One theme, one width. → Dark and narrow are where it breaks.
- ❌ One pass. → The second pass always finds something.
- ❌ Fixing a colour with a raw hex. → Token edit, or it fails token compliance.
