# Houston engine — agent dogfood loop

How an AI coding agent (Claude Code, Codex, Cursor, etc.) validates a Houston
PR by running the app and driving it like a user. Reasoning is not validation;
interaction is. This doc names the four surfaces, the canonical compile →
teardown arc, and the gotchas that cost real time.

## Four surfaces

| Surface | Drives | Boundary | Use it for |
|---|---|---|---|
| Engine HTTP API | `127.0.0.1:<port>/v1/*` over `curl` | Bearer token | Canonical state; every mutation is API-addressable |
| `cliclick` on Tauri window | macOS WKWebView via coords | System Events | Real desktop interactions a user would do |
| Interceptor on `http://localhost:1420` | Vite-served frontend in real Chrome | Full React DOM | Semantic refs, DOM tree, network log, screenshots |
| Vite HMR | Files under `app/src/**` | Fast-refresh boundary | Frontend iteration without restarting Tauri |

The engine is the canonical state surface. The other three are different ways
to drive the same React frontend against the same engine.

## Assertion class → surface

| Assertion | Surface |
|---|---|
| "Engine accepts this payload / emits this event" | HTTP API |
| "Bearer enforcement works" | HTTP API (`curl` without `Authorization`) |
| "Workspace / agent / preference persisted" | HTTP API (`GET` after `POST`) |
| "User can complete this flow in the actual app" | `cliclick` on Tauri window |
| "Pixel fidelity / spacing / colors look right" | `screencapture -R` + Read PNG |
| "React component renders the engine state correctly" | Interceptor (`tree`, `read`) |
| "Form handler invokes the right API" | Interceptor (`act`, then HTTP `GET` to verify) |
| "Frontend change shows up without rebuild" | Vite HMR |
| "Locale string parity / i18n" | Interceptor `tree` + `bun run check-locales` |

## Canonical arc

Ten steps. Each one is the smallest fully-cited atom of a validation loop.

1. **Compile engine.** `cargo build -p houston-engine-server`. Cold debug
   ~2–4 min; warm ~30s. Wired by PR #242 — `tauri-build` needs the sidecar at
   `app/src-tauri/binaries/houston-engine-<triple>` before `cargo check` on
   `app/src-tauri`.
2. **Launch.** From `app/`:
   ```bash
   HOUSTON_ENGINE_TOKEN=$(cat /tmp/houston-dogfood-token.txt) pnpm tauri dev
   ```
   Tauri spawns Vite on `:1420`, builds `app/src-tauri` host (~46s warm), then
   spawns the engine sidecar. Set `HOUSTON_ENGINE_TOKEN` first so the token
   survives sidecar respawn.
3. **Discover engine creds.** Tauri dev sets `HOUSTON_HOME=~/.dev-houston` for
   isolation (not `~/.houston/`). Engine writes port + `token_hash` to
   `~/.dev-houston/engine.json`. `sha256(HOUSTON_ENGINE_TOKEN)` matches
   `token_hash`.
   ```bash
   PORT=$(jq -r '.port' ~/.dev-houston/engine.json)
   TOKEN=$(cat /tmp/houston-dogfood-token.txt)
   BASE="http://127.0.0.1:$PORT"
   ```
4. **Probe.** `200` with bearer, `401` without.
   ```bash
   curl -sS -H "Authorization: Bearer $TOKEN" "$BASE/v1/health"
   curl -sS "$BASE/v1/health"  # → 401
   ```
5. **Drive engine state.** Create workspaces, set preferences, query providers.
   Persists to `~/.dev-houston/db/houston.db`. Routes table:
   `knowledge-base/engine-protocol.md`.
   ```bash
   curl -sS -H "Authorization: Bearer $TOKEN" -X POST \
     -H 'Content-Type: application/json' \
     -d '{"name":"dogfood"}' "$BASE/v1/workspaces"
   ```
6. **Drive the Tauri window with `cliclick`.** WKWebView is opaque to macOS
   accessibility — `AXButton` queries return `missing value` for everything
   except traffic-light buttons. Use coord-based clicks.
   ```bash
   osascript -e 'tell application "Houston" to activate'
   screencapture -x -t png -R 1480,200,470,980 /tmp/right-panel.png
   # Read /tmp/right-panel.png back, find input coords by eye, then:
   cliclick c:1662,1090
   cliclick t:"My test mission"
   cliclick kp:return
   ```
   `cliclick kp:tab kp:return` cycles focus + submits when click coords are
   uncertain.
7. **Capture evidence.** Region screenshots are cheaper to Read back into
   context than full-frame captures.
   ```bash
   screencapture -x -t png /tmp/houston-shots/01-launch.png
   screencapture -x -t png -R 1480,200,470,980 /tmp/houston-shots/02-chat.png
   ```
   Read the PNG; verify the visual change matches the assertion.
8. **Iterate frontend.** Edit any file under `app/src/**` or
   `app/src/locales/<lang>/<ns>.json`. Vite pushes an `hmr update` in ~200ms.
   Engine state survives the swap.
9. **Iterate engine.** Edit `engine/**/*.rs`. Tauri's watcher kills the
   sidecar, rebuilds, and respawns at a NEW random port. Re-read
   `~/.dev-houston/engine.json`. The bearer token persists across the respawn
   because you set `HOUSTON_ENGINE_TOKEN` at launch (step 2).
10. **Tear down.**
    ```bash
    kill $(cat /tmp/houston-tauri-dev.pid)
    ```
    `pnpm tauri dev` is the top-level parent; the engine sidecar's stdin
    watchdog and the macOS process-group kill cascade shutdown. If the parent
    dies but children survive (a `pnpm` signal quirk), see gotchas below.

## Driving Chrome at `:1420`

The Vite dev server serves the same frontend bundle to any browser, not just
the Tauri WebView. `app/src/lib/engine.ts:resolveConfig` has a three-tier
bootstrap:

1. `window.__HOUSTON_ENGINE__` (injected by `engine_supervisor.rs` via
   `initializationScript` — Tauri-only).
2. Vite env vars `VITE_HOUSTON_ENGINE_BASE` / `VITE_HOUSTON_ENGINE_TOKEN`.
3. `localStorage["houston.engine"]` as a JSON `{ baseUrl, token }` blob.
   Mirrors `examples/smartbooks/src/lib/config.ts`.

In Chrome, tier 3 is how an agent bootstraps. Set it before React mounts:

```bash
interceptor open "http://localhost:1420"
interceptor eval --main "localStorage.setItem('houston.engine', JSON.stringify({baseUrl: 'http://127.0.0.1:'+$PORT, token: '$TOKEN'})); location.reload()"
interceptor wait-stable
interceptor tree --filter interactive   # → e1, e2, ... semantic refs
interceptor act e1                       # click
interceptor act e31 "Bookkeeper-broomva" # type into a textbox
interceptor screenshot --json            # path is in JSON; --save is ignored
```

Until `engine.ts` had the localStorage tier, EngineGate trapped Chrome at the
splash and only state-independent screens were drivable. With it, any screen
the Tauri build reaches, Chrome reaches too — same React, same engine, same
bearer.

## Known gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `~/.houston/engine.json` missing after `pnpm tauri dev` launch | Tauri dev sets `HOUSTON_HOME=~/.dev-houston` for dev isolation | Read `~/.dev-houston/engine.json` instead |
| `cargo check --workspace` fails on CI | `tauri-build` requires sidecar at `app/src-tauri/binaries/houston-engine-<triple>` | `cargo build --release -p houston-engine-server` first (PR #242) |
| WKWebView returns `missing value` for every button | React DOM is opaque to macOS System Events; only traffic-light buttons are exposed | `cliclick` with coords from `screencapture -R`, or drive `:1420` via Interceptor |
| Typing lands on the mic button next to chat input | Tab cycled focus to the wrong control | Click the input directly with coords; verify with a zoomed region capture before typing |
| Engine port changes mid-session | Tauri supervisor respawned the sidecar (restart policy: exponential backoff 500ms → 30s cap) | Re-read `engine.json`; same token persists if `HOUSTON_ENGINE_TOKEN` was set at launch |
| `vite hmr invalidate /src/main.tsx "Could not Fast Refresh"` | `main.tsx` exports non-component values (`@vitejs/plugin-react` limitation) | Expect a full reload, not fast refresh; engine state still persists |
| Chrome frontend won't connect to engine | `localStorage["houston.engine"]` not set yet | `interceptor eval --main` the JSON blob before React mounts |
| `interceptor act eN` succeeds but UI doesn't advance | Handler called engine; engine call failed silently because `HoustonClient` wasn't bootstrapped | Same fix — set `localStorage["houston.engine"]` first, then `location.reload()` |
| `interceptor screenshot --save <path>` writes to `$PWD` instead | `--save` is ignored on this codepath | Use `--json` and read `filePath`, or move `$PWD/interceptor-screenshot-*.png` afterward |
| `pnpm tauri dev` died but Vite + engine survive | Node children outlive `pnpm` on some signals; engine's `spawn_parent_watchdog` only triggers on stdin EOF | `kill $(pgrep -f "target/debug/houston-engine") $(lsof -t -iTCP:1420)` before restarting; otherwise the next launch hits "Port 1420 already in use" |

See `CLAUDE.md` §"Engine sidecar staleness" for the related dev-only footgun
where `tauri dev` doesn't rebuild the engine on its own — run
`cargo build -p houston-engine-server` after touching `engine/**` before the
next `pnpm tauri dev`.

## Reference files

- `app/src/lib/engine.ts:resolveConfig` — three-tier bootstrap
- `examples/smartbooks/src/lib/config.ts` — canonical custom-frontend template
- `app/src-tauri/src/engine_supervisor.rs` — Tauri sidecar supervisor + banner parser
- `engine/houston-engine-server/src/main.rs::write_manifest` — `engine.json` writer
- `knowledge-base/engine-protocol.md` — full route table
- `knowledge-base/engine-server.md` — engine binary operator guide
- `knowledge-base/files-first.md` — `.houston/` layout the engine projects

## Limits + future improvements

- WKWebView accessibility opacity is structural; no fix from our side. The
  Tauri window will always need coord-based driving until WebKit exposes the
  React DOM to System Events.
- `interceptor screenshot --save` ignoring its argument is a bug in the
  Interceptor extension, not Houston. Workaround above.
- The `spawn_parent_watchdog` only triggers on stdin EOF, which `pnpm` does
  not always close on signal. A future engine PR could add a heartbeat-based
  watchdog so the sidecar dies even when stdin stays open.
- The Interceptor path requires the `localStorage` tier in
  `engine.ts:resolveConfig` — the third tier of the three-tier bootstrap
  documented above. The doc ships in the same PR pair as the bootstrap
  change; older worktrees need to rebase past that commit before they can
  dogfood from Chrome.
- A first-class binary-read endpoint on the engine (vs. the current
  `POST /v1/shell` escape hatch) would let an agent verify image / PDF /
  xlsx exports without shelling out to `open`.
