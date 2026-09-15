# @houston-ai/engine-client

The TypeScript front door to the Houston engine. The specifier
`@houston-ai/engine-client` resolves to the **v3 host adapter**
(`packages/web/src/engine-adapter/index.ts`) on every path: `app/vite.config.ts`
and `packages/web/vite.config.ts` alias it at build time, and `app/tsconfig.json`
and `packages/web/tsconfig.json` carry the matching `paths` entry at typecheck
time. So "compiles" and "runs" are the same answer — a method the adapter does
not implement is a compile error, not a run-time `TypeError`.

This package holds the half of the surface that is deployment-shape agnostic,
which the adapter re-exports verbatim:

- `src/types.ts` — the shared v3 wire-type surface, the TypeScript projection of
  protocol v3 (`packages/protocol`).
- `src/store-catalog.ts` — the public Agent Store reads (anonymous, CORS-open).
- `src/local-model-bridge.ts` — the `LocalModelBridgeAccess` port the desktop
  bridge binds.
- `src/retry-after.ts` — the `Retry-After` header parser every gateway fetch
  uses to honour a waking pod's backoff.

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
