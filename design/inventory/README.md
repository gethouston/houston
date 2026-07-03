# Cross-surface component inventory

Houston runs on three surfaces: **web/desktop** (React, shipping today), and the
coming native **iOS** (SwiftUI) and **Android** (Kotlin Compose) apps. A UI/UX
change made on one surface must not silently skip the others. Three layers keep
them in step:

| Layer | Owns | Source of truth |
| --- | --- | --- |
| **Behavior** | what a component does | the shared SDK view-models (`packages/sdk`) |
| **Look** | color / type / spacing / motion | design tokens (`packages/design-tokens`) |
| **Structure** | which components exist, their anatomy/states/semantics, and who implements which | **this directory** |

This directory is the **structural** layer. It answers: *does this component
exist on each surface, with the same parts, states, and semantics?* It is a
versioned engineering contract, CI-checked, not remembered.

A structural change here is procedure c of the three-surface maintenance
contract — how it flows relative to behavior (SDK) and look (tokens) changes is
in `knowledge-base/client-architecture.md`.

## Files

```
design/inventory/
  inventory.yaml        the versioned cross-surface component spec (source of truth)
  CHANGELOG.md          one entry per version bump
  manifests/
    web.yaml            web/desktop  — enforced
    ios.yaml            iOS          — unenforced (not built yet)
    android.yaml        Android      — unenforced (not built yet)
  README.md             this file
```

The checker lives at `scripts/check-parity.mjs` (`pnpm check:parity`), factored
into `scripts/parity/*` with tests at `scripts/check-parity.test.mjs`.

## Schema

### `inventory.yaml`

- `version` — integer, bumped on every add/modify of a component.
- `components` — a list; each entry (all fields required):

  | field | meaning |
  | --- | --- |
  | `id` | kebab-case, stable — never reuse or rename without a version bump |
  | `title` | human name |
  | `purpose` | one line: what it is / when it appears |
  | `anatomy` | named structural parts (non-empty list) |
  | `states` | distinct render states incl. loading/empty/error/streaming where real (non-empty list) |
  | `variants` | shape/context variants that are the *same* component |
  | `behavior` | semantic notes — what the SDK view-model drives (not styling) |
  | `a11y` | roles / labels / focus expectations |
  | `since` | inventory version the component first appeared in (`1 <= since <= version`) |

Only genuinely cross-surface components belong here (see *Scope* below).

### `manifests/<surface>.yaml`

- `surface` — must equal the filename base.
- `enforced` — `true` blocks the build on a lag; `false` only reports it.
- `inventoryVersion` — the inventory version this surface fully implements
  (`0` = nothing yet). May not exceed the inventory's own `version`.
- `components` — map of `component-id → { status, notes?, ref? }`:
  - `status` — `implemented` | `partial` | `not-started`.
  - `notes` — optional; explain a `partial`.
  - `ref` — optional; where the component lives (e.g. the `ui/` package).

`partial` is honest shorthand for "ships but has a real structural gap" — most
often the reusable, view-model-driven piece is still app/-locked rather than in a
shared `ui/` package, so a native surface can't yet reuse its structure.

## Scope — what is and isn't inventoried

**In:** components that will exist on native mobile — the conversation feed and
its item types (assistant text, streaming, thinking, tool chip, provider-error
card, system message), the composer, turn status, the board and its mission
cards/status chips, the approval/needs-you surface, agent list items and avatars,
progress, deliverables, routines and skills rows, empty states and toasts.

**Out (deliberately):** desktop-only chrome and power-user surfaces that mobile
won't ship — menu bars, resizable split panes, the file-tree browser, the
schedule/cron editor, skill-authoring dialogs, drag-and-drop machinery, and the
design-system *primitives* (buttons, dialogs, popovers, menus) that are owned by
the token/primitive layer rather than tracked as product structure.

## How a change flows

1. **Add or modify a cross-surface component** → edit `inventory.yaml`.
2. **Bump `version`.**
3. **Add a matching `## vN` entry to `CHANGELOG.md`.**
4. **Update every *enforced* surface manifest in the SAME PR** — an enforced
   surface may not leave a component with `since <= inventoryVersion`
   `not-started`. Use `partial` (with a `notes`) if it only half-lands.
5. **Unenforced surfaces (iOS/Android) update later.** As a native app
   implements components, flip their statuses and raise its manifest's
   `inventoryVersion` as it fully catches up.
6. **Flip `enforced: true`** for a surface only when its app *ships* at that
   inventory version.

## What `pnpm check:parity` does

Runs in CI alongside `pnpm check:boundaries`. It **fails the build** when:

- `inventory.yaml` or a manifest doesn't parse or violates the schema — unknown
  keys and typo'd statuses are hard fails, not silent passes;
- a manifest references a component that isn't in the inventory;
- an inventory component is missing an entry in any manifest;
- an **enforced** surface at `inventoryVersion N` leaves a component with
  `since <= N` `not-started` (or missing);
- a manifest claims an `inventoryVersion` beyond the inventory's `version`;
- `version` was bumped without a matching `CHANGELOG.md` entry.

It **never fails** on the unenforced surfaces; instead it prints a lag table so
iOS/Android progress is visible in every CI run.
