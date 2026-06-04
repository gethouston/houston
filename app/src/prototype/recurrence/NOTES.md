# Recurrence picker — prototype notes (issue #430)

> **Status: THROWAWAY.** Dev-only design exploration. Not shipped (`vite build`
> only inputs `index.html`, so `prototype.html` never ends up in a release).
> When a variant wins, its logic is **rewritten properly into
> `ui/routines/src/`** with tests — these files get deleted.

## The question

Houston routines' "custom" schedule is one "every N [min/hr/day]" input. It
can't express *"every Mon / Wed / Fri"*, *"the 2nd Tuesday"*, *"weekdays at
9am"*. **What should the richer recurrence picker look like**, for a
non-technical user who never sees cron?

## Round 1 → Round 2

Round 1 explored four radically different directions (sentence builder, grid,
natural-language, …). The user picked the **Google-Calendar "Repeat every…"
direction** and asked for refinements of just that, with full-name "Repeat on"
day buttons, grounded in Notion / Apple Calendar.

So the current set keeps **A** (the round-1 baseline) and adds **three refined
takes** — all sharing the requested pattern:

> `Repeat every [N] [unit ▾]` → when **week** is chosen, a `Repeat on` row of
> **full-name day buttons** (Monday-first, multi-select).

| Key | Name | Distinct execution | Reference |
|----|------|--------------------|-----------|
| **A** | Repeat-every (baseline) | round-1 version: unit *pills*, single-letter days, incl. min/hr | Google / Outlook |
| **E** | Notion Calendar | minimal & inline; live summary as the headline "value"; unit dropdown; full-name day *pills* | Notion / Cron |
| **F** | Apple Calendar | frequency-first, grouped sectioned rows; vertical full-name day **checklist**; monthly "Each / On the…" dual mode | Apple iOS / macOS |
| **G** | Houston refined | preset chips + custom-deep; unit dropdown; full-name day *pills*; tuned to Houston's pill/chip system — **the production candidate** | — |

Each sits in the same `Frame` (mirrors the real routine editor's "When it runs"
card) showing a live **plain-English summary**, a **next-3-runs preview**, and
an honest **cron-feasibility badge**.

## How to run

```bash
cd app
pnpm install      # only if this branch is a fresh checkout
pnpm dev          # vite dev server on http://localhost:1420
```

Open **http://localhost:1420/prototype.html**. No engine / Tauri / workspace
(bypasses EngineGate). Flip with the bottom bar or ← / → (also `?variant=A|E|F|G`).

## What the research said (Notion · Apple · Google)

- **Google / Notion**: interval + unit on **one row** ("Repeat every [1] [week ▾]");
  weekly "Repeat on" reveals day toggles; monthly is a **dropdown** ("on day 15"
  / "on the second Tuesday"); Ends = Never / On / After N. Notion's signature:
  the Repeat field **reads back the rule as a summary sentence**.
- **Apple**: **frequency-first**, grouped sectioned rows; "Every N [unit]" where
  the unit follows the frequency; weekly is a **vertical full-name checklist**
  (iOS) with check accessories; monthly is **"Each" (day grid) vs "On the…"
  (ordinal weekday)**; End Repeat rows.
- Week-start is locale-driven everywhere; we use **Monday-first** per the spec.

## Cron feasibility (honest, flagged in-UI)

Routines persist as a **5-field cron string** — infinite + stateless.

- **✅ Native today:** every N min/hr/day · specific weekday(s) (`0 9 * * 1,3,5`)
  · weekdays/weekends · fixed day-of-month · yearly month+day · time-of-day.
- **⚠️ Needs scheduler work** (anchor+counter or RRULE): "every N weeks/months/
  years" (N>1) · "the Nth weekday" (2nd Tuesday) · end conditions ("until
  <date>", "after N runs"). Shown amber so the UI choice is decoupled from the
  backend-scope choice.

## Why no tests here

Throwaway, about to be deleted. The **chosen** variant's logic gets real tests
when promoted into `ui/routines/src/` (extend
`ui/routines/tests/schedule-cron-utils.test.ts`).

## Verdict

_(to be filled once the user picks)_

- **Chosen variant:** …  (or a mix — e.g. "G's layout with F's monthly dual-mode")
- **Backend scope for v1:** cron-native only / + every-N-weeks / + ordinal / + end-dates
- **Next step:** rewrite the winner into `ui/routines/src/` with tests, delete
  this folder + `app/prototype.html`.
