# @houston-ai/engine-client

The TypeScript front door to the Houston engine. The specifier resolves to two
different things on purpose, and both are load-bearing:

- **At build and run time — the v3 host adapter.** `app/vite.config.ts` and
  `packages/web/vite.config.ts` both alias `@houston-ai/engine-client` to
  `packages/web/src/engine-adapter/index.ts`, which implements the client
  surface against `packages/host` over HTTP + SSE. This is the code every
  shipping build executes.
- **At typecheck time — this package's `src/`.** No tsconfig carries a matching
  `paths` entry, so `tsgo` resolves the specifier through `node_modules` to
  `src/index.ts`. `src/client.ts` (`HoustonClient`) and `src/ws.ts`
  (`EngineWebSocket`, `topics`) are therefore the type contract `app/src`
  compiles against — `app/src/lib/engine.ts` types `getEngine()` as
  `HoustonClient`. Keep a method here when `app/src` calls it.

`src/types.ts` is the shared v3 wire-type surface — the TypeScript projection of
protocol v3 (`packages/protocol`) — and the adapter re-exports it, so it means
the same thing on both resolution paths.

Because the two paths are held in sync by hand, a signature that exists here and
not on the adapter compiles but throws at run time
(`packages/web/src/engine-adapter/client/legacy-unsupported-mixin.ts` names the
operations the adapter deliberately refuses).

## Assistant catalog

The generator under `scripts/` derives the catalog from the LIVE surface only —
the adapter's `cp/` modules and `client/*-mixin.ts`, plus the SDK's REST modules
(`scripts/assistant-paths.ts` lists them). It never reads this package's `src/`,
so `@assistant` annotations belong on the adapter, not here. Gates:
`pnpm check:assistant-coverage` and `pnpm check:assistant-catalog`.

## Contract reference

- Wire types + zod: `packages/protocol/src/wire.ts` (protocol v3).
- The host that serves the contract: `packages/host` (`@houston/host`).
- The maintenance contract across surfaces (SDK / tokens / inventory / parity):
  root `CLAUDE.md` → "Client-surface changes (SDK first)".
