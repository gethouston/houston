# @houston/engine-adapter

The Houston engine client. Every domain `fetch`, SSE stream and WebSocket the
desktop app and `packages/web` make goes through here, binding `@houston/sdk`
against the host (protocol v3). One adapter serves both surfaces: `app/src` runs
verbatim in a browser as `packages/web`, so there is exactly one client to keep
honest.

```
src/
  client/       the HoustonClient mixin clusters app/src calls
  cp/           the transport: fetch, bearer recovery, retries, the event stream
  *.ts          the modules those two reach the wire through
```

It is a plain workspace package consumed as TypeScript source (`main` is
`src/index.ts`). `app` and `packages/web` both declare it, and pnpm's symlink is
the only thing that resolves it — vite, tsgo, node, biome and esbuild all agree
on which package the specifier names, without a line of configuration.
**There is no alias.** The specifier and the module are the same thing under
every resolver, which is why a method the adapter does not implement is a
compile error rather than a runtime `TypeError`.

Agreeing on the package is not the same as loading the barrel. Bundlers and
tsgo read `src/index.ts`; plain Node (`node --experimental-strip-types`, the
app's test runner) does not — the barrel imports its siblings without the `.ts`
extension, like nearly every `@houston/*` barrel, and `./client` is a directory,
so a VALUE import of the barrel throws `ERR_UNSUPPORTED_DIR_IMPORT`. Subpaths
load fine, which is why the node-tested modules in `app/src` re-export the
adapter's error predicates by subpath
(`@houston/engine-adapter/engine-waking-error`).

## Importing it

`@houston/engine-adapter` is the barrel — the surface `app/src` uses. Its
`exports` map also publishes every module under `src/` at its own path
(`@houston/engine-adapter/cp/fetch`, `@houston/engine-adapter/client/errors`),
because the adapter's own specs and `packages/web`'s wire specs test its
internals directly and `vi.mock` needs a module specifier, not a re-export.
Application code imports the barrel; the `app/src/lib` re-export shims reach for
a subpath because Node, not a bundler, runs them (above).

## What it does not do

- **Shapes**: `@houston/wire-types` holds the v3 wire contract and has no I/O.
  The adapter re-exports it, so `app/src` sees one surface.
- **Behavior**: turn lifecycle, conversation VM, reconnection — `@houston/sdk`.
  Change behavior there and let the adapter bind it; never re-implement it here.

## Checks

`pnpm --filter @houston/engine-adapter test` (vitest, co-located `*.test.ts`) and
`pnpm --filter @houston/engine-adapter typecheck`. The wire specs that drive the
client against `@houston/fake-host` live in `packages/web/tests`.

## The assistant catalog

The AI Manager's catalog is generated from this package (`src/cp/` +
`src/client/*-mixin.ts`) plus the SDK's modules by `pnpm gen:assistant-catalog`,
and rendered into `docs/assistant/`. What the generator reads is the `@assistant`
JSDoc tag on each operation, whose grammar is stated once in
`scripts/assistant-catalog/assistant-jsdoc.ts`: `group:<slug>`,
`confirm: <reason>`, `unconfirmed: <reason>`, `hidden: <reason>`,
`hands: <card>`, `unroutable: <reason>`, `unschematized: <reason>`. A reason runs
to the end of its line, so a reason-bearing tag is the last one on it.

`pnpm check:assistant-coverage` refuses anything less than a properly annotated,
routable operation or a written reason why it is not. The rule list lives in
`scripts/assistant-catalog/assistant-gate.ts`, each violation naming the exact
edit that clears it. Its sharpest edges: `confirm-unstated` (a bare `confirm`
with no reason), `stale-unroutable` (an `unroutable:` reason on an operation the
generator can now route), `route-conflict` (two operations claiming one address),
and the three that guard a hidden operation's escape hatch, `hands-missing`,
`hands-unhidden`, `hands-unknown` (a card outside `HANDS_ON_SURFACES`).
