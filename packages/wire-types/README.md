# @houston/wire-types

Protocol v3 as the client sees it: the request and response shapes every Houston
surface speaks in, and nothing else. This package performs **no I/O** — no fetch,
no socket, no gateway base. It is types plus two pure modules, so anything may
import it without pulling a transport along.

- `src/types.ts` — the shared wire-type surface: a hand-maintained projection of
  `packages/protocol` (which carries the zod schemas the host validates against),
  widened with the shapes only a gateway deployment serves — billing, orgs, teams.
- `src/local-model-bridge.ts` — the `LocalModelBridgeAccess` port the desktop
  bridge binds. A port is a type; the implementation is in the shell.
- `src/retry-after.ts` — the `Retry-After` header parser every gateway fetch uses
  to honour a waking pod's backoff.

The client that performs the requests is the engine adapter
(`packages/engine-adapter`), which imports this package and re-exports
it, so `app/src` reads one surface.

Its `version` (`0.4.0`) does not track the app's: `scripts/version.sh` bumps
only the packages that share Houston's single release line and excludes this one
by name, alongside `ui/agent` and `ui/agent-schemas`.

## Keeping it true

The host is the source of truth. When a route's payload changes in
`packages/host`, change it here in the same PR — otherwise the app compiles
against a contract nothing serves. `packages/protocol/src/wire.ts` holds the zod
schemas; this is the wider TypeScript view of the same contract.

## Contract reference

- Wire types + zod: `packages/protocol/src/wire.ts` (protocol v3).
- The host that serves the contract: `packages/host` (`@houston/host`).
- The maintenance contract across surfaces (SDK / tokens / inventory / parity):
  root `CLAUDE.md` → "Client-surface changes (SDK first)".
