---
name: frontend-design
description: Design new Houston UI (app screens, components, website sections) with intent, not templated defaults. Two-pass discipline inside Houston's token system, multi-variant exploration for new surfaces, restraint rules. Supplements the design system with process; the design system wins on conflict. Run /design-review before calling any UI done.
---

# /frontend-design

Design like the lead at a studio that gives every product an identity no one else could mistake. Deliberate, opinionated choices — but always **inside Houston's system**. Distinctiveness here is earned through restraint and precision, not novelty for its own sake.

## Precondition — load the system FIRST

Before any pixel:

1. Read **`/DESIGN.md`** (repo root) FIRST — the compact, agent-facing spec you hold in context (identity, hard rules, token quick-reference, motion, banned defaults, polish checklist, component inventory). Then **`knowledge-base/design-system.md`** for the surface you touch — the deeper narrative layer (rationale, detailed component/animation guidance, futuristic-theme internals).
2. Token VALUES are authoritative in **`packages/design-tokens/tokens/*.json`** (semantic `--ht-*` alias layer, light + dark). Never a hardcoded hex/spacing literal — a visual change is a token edit (design-system.md → Change procedure).
3. Search before building: `@houston-ai/*` showcase, existing `app/src` components, shadcn/ui registry. Reuse beats invention (`houston/CLAUDE.md` → Search before building).

**The design system wins on any conflict.** This skill adds *process*; it never overrides a documented token, rule, or pattern.

## Two-pass discipline

### Pass 1 — commit direction BEFORE code

Write a compact plan, entirely within Houston's tokens. Keep it in your thinking / a scratch note; show the user only once you're confident:

- **Layout concept** — one-sentence prose + an **ASCII wireframe**. Place it on the real surface ladder (`bg-background` canvas, `bg-card` floats, `bg-input` fields — design-system.md → The surface ladder; there is no `layer-*` token).
- **Hierarchy** — name the ONE focal point. One obvious action per screen (Show, don't configure).
- **The signature element** — the single thing this surface is remembered by, drawn from Houston's world (the composer's multi-shadow lift, the card-running-glow, the aurora chrome). Spend boldness here.
- **Motion moments** — where (if anywhere) animation serves: a load sequence, a reveal, a hover micro-interaction. Use only the vocabulary in design-system.md → Animation (durations, springs, `card-running-glow`, framer springs). Less is usually more.
- **Copy** — the real strings, in Houston's voice (see Copy rules below).

### Pass 2 — self-critique the plan, then revise

Interrogate the plan before writing code:

> "Does any part read like the generic default I'd produce for *any* surface of this kind?"

Work the prompt as if from scratch — if you'd land in the same place, that part is a default, not a choice. **Banned defaults** (don't duplicate the list): `/DESIGN.md` → Banned generic-AI defaults, plus the three AI-cluster looks (cream + high-contrast serif + terracotta; near-black + one acid accent; broadsheet hairlines + zero radius). Revise the part, say what changed and why. Only then write code, deriving every value from the revised plan.

## Multi-variant rule (NEW surfaces only)

A **new screen, new website section, or new major component** gets 3–5 genuinely distinct directions explored as *cheap* artifacts first — never in `src/`:

1. Produce each as an **ASCII wireframe + a short written treatment** (hierarchy, signature, motion, copy), or as throwaway HTML mockups in a **scratch dir outside the repo** (your scratchpad, never `app/src`, `packages/web/src`, `ui/`, or `website/src`).
2. Judge them **pairwise** against the brief + the design system. Kill the defaults.
3. Pin the winner in a **short written spec** (the Pass-1 plan, hardened).
4. THEN build the winner in `src/`, following the spec exactly.

**Small edits to an existing surface skip variants** — match the surrounding design exactly (same tokens, same spacing rhythm, same component grammar). Don't redesign a neighbourhood to change one house.

## Restraint rules

- **Spend boldness in one place.** The signature is the one memorable thing; keep everything around it quiet and disciplined.
- **The product/content is the hero**, not the chrome. Monochrome content; brand colour lives only in chrome (design-system.md → Color restraint).
- **When in doubt, remove one decoration.** Before declaring a surface done, take one accessory off.
- **Match complexity to the vision.** Minimal directions demand precision in spacing, type, and detail — elegance is executing the chosen vision well, not adding to it.
- Quality floor, unannounced: responsive to narrow widths, visible keyboard focus, `prefers-reduced-motion` respected, no hover-only affordances.

## Copy rules

Words are design material (design-system.md → Non-technical labels; `houston/CLAUDE.md` → Internationalization). Every user-facing string:

- **Sentence case.** Never uppercase / `tracking-wider` headers.
- **Verbs that name the action** — "Save changes", not "Submit". "Start", "Approve", "Delete".
- **Consistent naming across a flow** — the button that says "Publish" produces a toast that says "Published".
- **Active voice, plain words**, non-technical (the target user never sees files/JSON/config/CLI). Errors explain what happened and how to fix it; empty states invite an action.
- **No em dashes** in user-facing copy — commas or sentence breaks (validator enforces).
- **Everything user-facing flows through i18n** — `t()` in `app/` (en source, es + pt mirror the shape; namespaces under `app/src/locales/<lang>/`). `ui/@houston-ai/*` stays i18n-agnostic: expose optional `labels?` props with English defaults; the `app/` consumer passes `t()` results in. Never import `react-i18next` in `ui/`.

## When you touch shared surface

- New/changed cross-surface component → bump `design/inventory/inventory.yaml` + CHANGELOG in the SAME change and run `pnpm check:parity` (`houston/CLAUDE.md` → Client-surface changes).
- Generic reusable → `ui/`. App-specific → `app/`. Props over stores; no `@/` aliases and no app types in `ui/`.

## Gate

**Design is not done until `/design-review` passes.** Never declare UI work complete on the strength of the code alone — run the screenshot self-critique loop first.
