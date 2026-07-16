# Houston Web (`packages/web`)

Standalone browser build of the Houston desktop UI. It composes `app/src`
verbatim and swaps Tauri/OS imports for browser shims at build time.

The current target backend is the Houston host (`packages/host`) over protocol
v3. The legacy Rust-engine connect flow still exists as the default path until
final cutover, but normal convergence work uses host mode.

## Modes

- **Host mode**: `VITE_CONTROL_PLANE_URL` is set. `@houston-ai/engine-client` is
  aliased to `src/engine-adapter`, the app signs in if Firebase (GCIP) env is
  present, and all domain calls go to the host.
- **External new-engine mode**: `VITE_NEW_ENGINE=1` or `VITE_NEW_ENGINE_URL` is
  set. The browser shows the new-engine connect screen unless URL/token are
  pre-seeded.
- **Legacy mode**: no host/new-engine env. The old connect screen points at a
  Rust `houston-engine` URL + token. Kept only until final cutover.

## Running in dev

Run `pnpm dev` from the repo root — the ONE entry point. Its `web` pane serves
this package on http://localhost:1430 against the local Go gateway (cloud
profile: real sign-in, multiplayer). See `knowledge-base/dev-loop.md`.
Do not run this package's `dev` script directly; outside the pane's env it
boots a differently-configured app, which is the drift `pnpm dev` exists to
prevent.

## How It Works

```
src/
  main.tsx          chooses host/new-engine/legacy mode from env
  cloud-login.tsx   host-mode auth wrapper
  app-tree.tsx      app/src providers + gates + <App />
  engine-adapter/   v3 host adapter for @houston-ai/engine-client
  new-engine/       external-host connect screen + app wrapper
  shims/            @tauri-apps/* browser equivalents
  admin/            cloud operator dashboard mounted at /admin
```

Host mode covers workspaces, agents, chat, board, skills, routines, files,
providers, preferences, attachments, portable agents, integrations, and global
`/v1/events` reactivity. The store/marketplace UI was cut; store calls in the
adapter return empty data or a harmless warning.

## Optional Env

- `VITE_CONTROL_PLANE_URL` / `VITE_CP_DEV_TOKEN` — host-mode endpoint + dev token.
- `VITE_NEW_ENGINE` / `VITE_NEW_ENGINE_URL` / `VITE_NEW_ENGINE_TOKEN` — external
  new-engine mode.
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — account sign-in for cloud host mode.
- `POSTHOG_KEY` / `POSTHOG_HOST` — analytics.
- `SENTRY_DSN` — error reporting.

Auth storage mode is forced to `browser`; a browser tab has no OS keychain.

## Browser Equivalents And Limits

Browser shims implement external-link open, desktop notifications, and portable
agent import/export via Blob download and file input.

Desktop-only actions surface a clear error if triggered: reveal in Finder, open
file or terminal, pick local directory, native app update, and local log files.

`Report Bug` works in cloud host mode by posting the desktop payload to the
host's `POST /feedback` route, which files Linear server-side. Outside cloud host
mode it stays desktop-only.

## Parity Guard

`scripts/check-tauri-shims.mjs` runs during `typecheck` and `build`. It fails if
`app/src` imports a new Tauri module or invokes a new native command that this
package has not shimmed.

## Relationship To Other Frontends

- `app/` — Tauri desktop app, same React tree plus native shell.
- `packages/web` — same UI in a browser tab, backed by the host.

`mobile/` and `houston-relay/` were removed in the convergence.
