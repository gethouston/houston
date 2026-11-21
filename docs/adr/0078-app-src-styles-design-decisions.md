# app/src/styles: design decisions

Covers `app/src/styles/`: the app's global stylesheets. File paths in this record are relative to `app/src/`.

## The shared canvas is imported last

Its token overrides must win at use time.

Lives in `styles/globals.css`.

## Streamdown is scanned for Tailwind classes

The chat markdown renderer emits its own utilities and lives under `ui/chat`'s node_modules, so Tailwind must scan it.

Lives in `styles/globals.css`.

## Dark logo swap respects light-pinned subtrees

`:not()` guards keep the swap out of `data-theme="light"` subtrees.

Lives in `styles/globals.css`, `styles/futuristic.css`.

## Catalog connect card layering

The card border and fill live on a layer behind the row so the row does not reflow when a connect hand-off expands it; only content below moves.

Lives in `styles/globals.css`.

## Tutorial spotlight veil

A large spread shadow darkens everything outside the anchor; the same veil without a hole covers beats with no anchor.

Lives in `styles/futuristic.css`.
