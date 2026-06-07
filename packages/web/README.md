# Houston Web (`packages/web`)

Houston as a standalone **web app**. It runs the exact same UI as the desktop
app in a plain browser tab, talking to a remote `houston-engine` over HTTP+WS.

No fork: this package **composes** the desktop frontend (`app/src`) verbatim and
swaps the handful of Tauri/OS couplings for browser shims at build time. The
desktop app is untouched.

## How it works

The desktop app is already engine-agnostic — every domain call goes through
`@houston-ai/engine-client` (HTTP+WS), not Tauri IPC. The only platform coupling
in `app/src` is a small set of `@tauri-apps/*` imports. This package:

1. **Aliases** each `@tauri-apps/*` specifier to a browser shim under
   `src/shims/` (see `vite.config.ts` + `tsconfig.json`). `isTauri()` returns
   `false`, so the app's existing `osIsTauri()` branches (e.g. provider
   device-code sign-in) automatically take the web path.
2. **Aliases** `@houston/app/*` → `../../app/src/*` and reuses the real React
   tree (`src/app-tree.tsx` mirrors `app/src/main.tsx`'s provider/gate nesting).
3. Adds a web **boot entry** (`src/main.tsx` → `src/root.tsx`): a **Connect
   screen** captures the engine URL + token (persisted to `localStorage`) and
   sets `window.__HOUSTON_ENGINE__` *before* the app graph loads, so
   `app/src/lib/engine.ts` bootstraps cleanly.

```
src/
  main.tsx          # entry: sets engine global from localStorage, mounts <Root>
  root.tsx          # Connect screen  ↔  lazy-loaded app tree
  app-tree.tsx      # composes app/src: providers + EngineGate + gates + <App/>
  engine-config.ts  # localStorage read/write of { baseUrl, token }
  components/        # connect-screen, boot-splash
  shims/             # @tauri-apps/* → browser equivalents
```

## Run it

You need a running `houston-engine` reachable from the browser (it prints its
URL + token on startup: `HOUSTON_ENGINE_LISTENING port=… token=…`). The engine
already sends permissive CORS and accepts the WS token as a query param, so a
browser can talk to it directly.

```bash
pnpm --filter houston-web dev      # http://localhost:1430
```

Open the page, paste the engine URL (`http://127.0.0.1:<port>`) and token into
the Connect screen. Build for production with `pnpm --filter houston-web build`.

### Optional env (`packages/web/.env.local`)

All optional — absent values no-op gracefully:

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — enable account sign-in. **See "Auth"
  below** — web OAuth is not wired yet, so leave these empty for now (the app
  runs auth-less, which is the intended mode for self-hosted engines).
- `POSTHOG_KEY` / `POSTHOG_HOST` — analytics.
- `SENTRY_DSN` — error reporting.

Auth storage mode is **forced to `browser`** (localStorage) — a browser tab has
no OS keychain.

## What's identical vs degraded on web

**Identical** (pure engine wire): workspaces, agents, chat, the board, skills,
store, routines, files, providers, preferences, worktrees, shell, and all
reactivity (engine WS firehose). Provider sign-in uses the headless device-code
flow automatically (`!osIsTauri()`).

**Browser-native equivalents** (implemented in the shims): open external links
(`window.open`), desktop notifications (web Notification API), portable agent
export/import (Blob download / `<input type=file>`).

**Desktop-only — surfaced as a clear error if triggered** (they target the
user's local machine, which a remote engine can't reach): reveal-in-Finder,
open-file/terminal, pick local directory, app self-update, native bug-report,
local log files.

**Known follow-ups** (all graceful — caught + toasted, never a crash):

- **Auth (OAuth):** the desktop flow uses a `houston://` deep link forwarded by
  Rust, which has no browser equivalent. A web flow (same-origin redirect +
  `detectSessionInUrl` / code exchange on load) is the remaining piece. Until
  then, ship with empty Supabase env (sign-in is skipped). Note: needs a Supabase
  dashboard redirect-URL allowlist entry too, so it's infra + code.
- **Report Bug** button throws a "desktop-only" toast on web (no local logs to
  bundle); a web bug-intake endpoint could replace it.
- **"Reveal in folder"** on a portable-agent export throws a graceful
  "desktop-only" toast (the export download itself works). Hiding the button
  needs a one-line `osIsTauri()` guard in `app/src/components/portable` —
  deliberately not done here to keep `app/` untouched (approach A).
- **Disclaimer "Decline"** can't close a top-level browser tab (a browser
  limitation, not ours); Accept works normally, and the user can close the tab.

The last two (and a future web OAuth) are the only places a tiny `osIsTauri()`
branch in `app/src` would improve web UX without affecting desktop — a clean
opt-in if we later relax the zero-`app/`-changes rule.

## Parity guard

`scripts/check-tauri-shims.mjs` (run by this package's `typecheck`/`build`)
fails if `app/src` ever imports a **new** `@tauri-apps/*` module or invokes a
**new** native command that this package hasn't shimmed — so web parity can
never silently drift. Run directly with `pnpm --filter houston-web check-shims`.

## Relationship to the other frontends

- `app/` — the Tauri desktop app (the engine-co-located build).
- `mobile/` — a separate, lean PWA (chat + mission control) over the relay.
- `packages/web` — the **full** desktop UI, in the browser, against any engine.
