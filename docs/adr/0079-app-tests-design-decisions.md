# app/tests: design decisions

Covers `app/tests/`: the node test suite for app logic and its source-reading guards. File paths in this record are written from the repo root.

## The node runner has no DOM, so some guards read source

`app/tests` runs under node:test with `--experimental-strip-types`. Components that load React, framer-motion, i18n or the Tauri bridge cannot render there, so the repo's idiom for those contracts is to assert on component or hook source. Such assertions must target code, never comment text, or they pass for the wrong reason.

Lives in `app/tests/*.test.ts` (for example `card-unification.test.ts`, `credential-scope-ui.test.ts`, `agent-admin-a11y.test.ts`), `app/tests/jsx-tags.ts`.

## `app/src/lib/analytics.ts` is read as source

`app/src/lib/analytics.ts` pulls posthog-js and the engine adapter, so the analytics contract tests slice its source between anchors through one fixture, and a separate test guards those anchors so the downstream tests stay meaningful.

Lives in `app/tests/fixtures/analytics-source.ts`, `app/tests/analytics-vocabulary.test.ts`.

## Token discipline blanks comments first

The raw-colour rules blank every comment while keeping line counts, because prose cites issue numbers and colour formats.

Lives in `app/tests/token-discipline-rules.ts`.

## pdf.js worker fixture

The `?worker` bundle only Vite can build, so tests run the real worker code on the same thread behind a port. pdf.js only accepts a port that is an instance of the page's `Worker`. Under Node it looks for the optional native canvas package, so it gets an empty stand-in, loaded ahead of any module mock because a `node:test` mock takes `require` away from the hooks.

Lives in `app/tests/fixtures/pdf-worker.ts`.

## jsdom globals load before react-dom

React reads `window` and `document` at module load, so `dom-env.ts` must be imported before any dynamic `react-dom/client` import.

Lives in `app/tests/support/dom-env.ts`.

## Globals are restored exactly

Test files snapshot the `globalThis` properties they touch and restore them, deleting ones that were absent, so isolation holds across files that share one process.

Lives in `app/tests/support/restore-globals.ts`, `app/tests/support/native-surface.ts`.

## Representative catalog fixture

The sample catalog mirrors the host's `/v1/catalog` shape, including entries the curated sets hide and a provider with no override, so hydration and visibility rules are exercised against realistic data.

Lives in `app/tests/fixtures/sample-catalog.ts`.
