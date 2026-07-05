# @houston-ai/engine-client

The TypeScript front door to the Houston engine. What it provides depends on the
consumer:

- **`src/types.ts` — the shared v3 wire-type surface.** These types are the
  TypeScript projection of protocol v3 (`packages/protocol`). The desktop and web
  builds alias `@houston-ai/engine-client` to the v3 **host adapter**
  (`packages/web/src/engine-adapter`, via `vite.config.ts`), which re-exports
  these types and implements the client function surface against `packages/host`
  over HTTP + SSE. This is the path every shipping build takes.
- **`src/` v1 REST/WS transport (`HoustonClient`, `EngineWebSocket`) — legacy.**
  This was the client for the old Rust engine's HTTP+WS protocol. That engine has
  been deleted, and no build wires this transport in anymore (both surfaces alias
  the v3 adapter above). It is kept only pending the v3-client consolidation
  follow-up (`convergence/follow-ups.md`), which folds the remaining consumers
  onto `@houston/runtime-client` / `@houston/sdk` and removes this v1 code.

## Usage (v3, via the alias)

Consumers import from `@houston-ai/engine-client` and get the v3 adapter's
function surface (workspaces, agents, conversations, files, skills, routines,
events, …) plus the wire types. Desktop-app bootstrap (reads
`window.__HOUSTON_ENGINE__` injected by the Tauri shell) lives at
`app/src/lib/engine.ts`.

## Contract reference

- Wire types + zod: `packages/protocol/src/wire.ts` (protocol v3).
- The host that serves the contract: `packages/host` (`@houston/host`).
- The maintenance contract across surfaces (SDK / tokens / inventory / parity):
  `knowledge-base/client-architecture.md`.
