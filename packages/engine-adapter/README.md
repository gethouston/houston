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
without a line of configuration. **There is no alias.** The specifier and the
module are the same thing under every resolver, which is why a method the
adapter does not implement is a compile error rather than a runtime `TypeError`.

## Importing it

`@houston/engine-adapter` is the barrel — the surface `app/src` uses. Its
`exports` map also publishes every module under `src/` at its own path
(`@houston/engine-adapter/cp/fetch`, `@houston/engine-adapter/client/errors`),
because the adapter's own specs and `packages/web`'s wire specs test its
internals directly and `vi.mock` needs a module specifier, not a re-export.
Application code imports the barrel.

## What it does not do

- **Shapes**: `@houston/wire-types` holds the v3 wire contract and has no I/O.
  The adapter re-exports it, so `app/src` sees one surface.
- **Behavior**: turn lifecycle, conversation VM, reconnection — `@houston/sdk`.
  Change behavior there and let the adapter bind it; never re-implement it here.

## Checks

`pnpm --filter @houston/engine-adapter test` (vitest, co-located `*.test.ts`) and
`pnpm --filter @houston/engine-adapter typecheck`. The wire specs that drive the
client against `@houston/fake-host` live in `packages/web/tests`, and the
assistant catalog is generated from `src/cp/` + `src/client/*-mixin.ts`
(`scripts/assistant-catalog/`).
