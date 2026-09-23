# Cross-surface component inventory

Houston's product UI is one React tree, shipping on **desktop** (Tauri) and
**web**. Which components exist, and what each one is made of, is a contract
rather than something remembered. Three layers keep it in step:

| Layer | Owns | Source of truth |
| --- | --- | --- |
| **Behavior** | what a component does | the shared SDK view-models (`packages/sdk`) |
| **Look** | color / type / spacing / motion | design tokens (`packages/design-tokens`) |
| **Structure** | which components exist, their anatomy/states/semantics, and who implements which | **this directory** |

This directory is the **structural** layer. It answers: *does this component
exist, with the parts, states, and semantics it is specified to have?* It is a
versioned engineering contract, CI-checked, not remembered.

How a structural change flows relative to behavior (SDK) and look (tokens)
changes is in the root `CLAUDE.md` → "SDK is the single source of truth".

## Files

```
design/inventory/
  inventory.yaml        the versioned component spec (source of truth)
  CHANGELOG.md          one entry per version bump
  manifests/
    web.yaml            desktop + web — enforced
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

Only genuinely shared product components belong here (see *Scope* below).

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
shared `ui/` package.

## Scope — what is and isn't inventoried

**In:** the product components that carry real structure — the conversation feed
and its item types (assistant text, streaming, thinking, tool chip, provider-error
card, system message), the composer, turn status, the board and its mission
cards/status chips, the approval/needs-you surface, agent list items and avatars,
progress, deliverables, routines and skills rows, empty states and toasts.

**Out (deliberately):** desktop-only chrome and power-user surfaces — menu bars,
resizable split panes, the file-tree browser, the schedule/cron editor,
skill-authoring dialogs, drag-and-drop machinery, and the
design-system *primitives* (buttons, dialogs, popovers, menus) that are owned by
the token/primitive layer rather than tracked as product structure.

## How a change flows

1. **Add or modify an inventoried component** → edit `inventory.yaml`.
2. **Bump `version`.**
3. **Add a matching `## vN` entry to `CHANGELOG.md`.**
4. **Update every *enforced* surface manifest in the SAME PR** — an enforced
   surface may not leave a component with `since <= inventoryVersion`
   `not-started`. Use `partial` (with a `notes`) if it only half-lands.
5. **Flip `enforced: true`** for a surface only when its app *ships* at that
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
