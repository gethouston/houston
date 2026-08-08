# Crash reporting (Sentry)

Three runtimes, one Sentry project. **Dormant by default** — no DSN, no client.

- **Org / project:** Sentry org `houston-cd` → team `houston-eng` → project
  `houston-app` (platform `javascript-react`). Console: https://houston-cd.sentry.io.
- ONE project for THREE runtimes — the renderer (JS), the Tauri app process (Rust),
  and the `houston-engine` sidecar (the bun-compiled TS host + every pi runtime it
  spawns). Events carry a `runtime` tag (`engine`, `engine-supervisor`) to tell them
  apart.

## Dev suppression (`SENTRY_SEND_IN_DEV`, HOU-469)

Dev builds DON'T send by default — a HARD gate (no client initialized), not a soft
`environment: development` tag. Official builds bake the prod DSN, so a developer
running `pnpm tauri dev` with it exported would otherwise fire dev errors (including
the smoke triggers) into the prod project.

- **One rule across all three layers**: `dsn_present && (release_build ||
  send_in_dev)` — `sentry_should_activate` (`app/src-tauri/src/lib.rs`),
  `sentrySuppressedInDev` (`app/src/lib/sentry.ts`, from the `__SENTRY_SEND_IN_DEV__`
  Vite define), and the engine's own `activation.ts`.
- Truthy values: `1` / `true` / `yes` / `on`. Release builds ignore the flag entirely.
- When the app suppresses it injects NO DSN into the engine (so the engine no-ops);
  when it opts in it also injects `SENTRY_SEND_IN_DEV`. The env vars are built by the
  pure, unit-tested `engine_sentry_env`, and the supervisor
  (`engine_supervisor.rs`) `env_remove`s any inherited `SENTRY_*` first — a
  shell-exported DSN can't make the sidecar self-report behind the app's back.
- `build.rs` (`configure_sentry_env`) emits `cargo:rerun-if-env-changed` for
  `SENTRY_DSN` + `SENTRY_SEND_IN_DEV`, so a shell-only toggle recompiles and both the
  compile-time `option_env!` gate and the renderer's Vite define agree for the same
  session.
- The renderer shows a dev-only `info` toast ("You're in dev mode, no issue sent" +
  the flag hint) where the green "report sent" toast would go. Intentionally
  English-only — it's for us.

## Per-runtime wiring

### App process (Rust)

Initialized in `lib.rs` BEFORE other plugins, conditional on
`sentry_should_activate`. `environment` is explicitly `production` for release builds
and `development` for `pnpm tauri dev`. `release` is
`houston-app@<CARGO_PKG_VERSION>`, built explicitly so the SAME string is forwarded
to the engine and matches what release.yml uses for sentry-cli uploads.

### Engine (TS host + pi runtime)

Self-inits from env in BOTH processes — the host
(`packages/host/src/local/main.ts`) and every runtime it spawns
(`packages/runtime/src/main.ts`, inheriting the host's env).

- Shared module `@houston/runtime-client/sentry`
  (`packages/runtime-client/src/sentry/`): a thin client on dependency-free
  `@sentry/core` + a plain fetch transport, deliberately NOT `@sentry/node` (its
  OpenTelemetry require-hooks don't survive `bun build --compile`).
- Activation is the same rule in one pure function (`activation.ts`, unit-tested):
  `SENTRY_DSN present && (production context || SENTRY_SEND_IN_DEV)`, where
  production context = the compiled sidecar (`HOUSTON_SIDECAR_BINARY`), a managed pod
  (`HOUSTON_MANAGED_CLOUD=1`), or `NODE_ENV=production` (self-host image). A source
  run (tsx/vitest/`pnpm dev`) with a shell-exported DSN stays suppressed. The host
  announces the decision at boot.
- **Event identity**: tags `runtime=engine` (the established convention the daily
  queries key on), `engine_process=host|runtime`,
  `deployment=managed-cloud|desktop|selfhost|dev`, `engine_version` (the part of the
  release after `@` — `0.5.9` on desktop, the git sha on pods), plus
  `org_slug`/`agent_slug` on managed pods (what makes "whose agent hit this?"
  answerable from the issue alone); `server_name` = the pod name on GKE; contexts `os`
  (platform + kernel) and `app.app_start_time` (boot-path crash vs long-uptime failure
  at a glance).
- **Error feed**: the host wraps console (`installConsoleCapture`); the runtime feeds
  its logger's `capture` hook (`observability/logging.ts`). ERROR → event; a real
  `Error` in the args becomes an exception with its own stack, a bare string becomes a
  message event with a SYNTHETIC stack at the log site attached as a **THREAD** (not
  an exception, which would retitle the issue to the top frame's function name), with
  the reporter's trailing frames trimmed so the innermost frame is the code that
  logged. Every level → breadcrumb (last 100 ride each event).
- **Inline source context** (`frames.ts addSourceContext`, the `@sentry/node`
  ContextLines equivalent): the engine reads the mapped `.ts` files off disk at
  capture and attaches pre/context/post lines. Works on pods + self-host (the image
  COPYs `packages/*` sources) and in dev; the compiled desktop sidecar has no files on
  disk, so its frames stay file:line-only.
- **User identity**: the engine reads
  `HOUSTON_USER_ID`/`HOUSTON_USER_EMAIL`/`HOUSTON_USER_NAME` into the Sentry `user`
  (the desktop shell injects them at sidecar spawn from the Keychain session blob,
  gated on the same decision; the gateway pod spec passes the org owner's), falling
  back to `user.id = org_slug` on pods so users-affected never reads zero.
- **Two demotion rules keep the stream signal-only.** Node process warnings
  (`(node:<pid>) … Warning: …`, which Node prints through `console.error`) become
  warning breadcrumbs, never events. The host's background-daemon log callbacks
  (store-sync, usage sampler) route through `severityLog` (`local/host.ts`) — an entry
  WITH an error → `console.error` (event), without → `console.info` (breadcrumb).
  **Do NOT `console.error` operational lines in the host**: every one becomes a Sentry
  error issue (the "[store-sync] hydrated N objects" flood was exactly this).
- **Crash semantics**: the host stays up on uncaught errors (captured via the console
  wrap); the runtime exits non-zero on uncaughtException/unhandledRejection but
  captures + flushes first; the host's fatal boot paths flush before
  `process.exit(1)`.
- Dormant by default: empty DSN = no client at all. Self-hosters opt in via
  `SENTRY_DSN` in `selfhost/docker-compose.yml`; none is baked into open-source
  builds.

### Engine pods (managed cloud)

`engine-pod-image.yml` bakes `SENTRY_DSN` (repo secret — the same DSN the public
desktop binaries embed, not a cluster credential) and
`SENTRY_RELEASE=engine-pod@<git-sha>` into the `engine-pod` Docker target as build
args, plus `SENTRY_ENVIRONMENT=production`. Fork/local image builds pass no args →
dormant. The `selfhost` target gets NO DSN. Rotating the DSN = rotate the secret +
rebuild the image; no gateway change involved.

### Engine crash supervisor

`engine_supervisor.rs` captures a Sentry event (`runtime=engine-supervisor`,
`source=engine_crash`, fingerprinted so a crash-loop is one issue) when the engine
subprocess exits abnormally (non-zero / signal) while NOT shutting down — the one
signal that survives an engine too dead to self-report. Graceful stdin-EOF shutdown
(exit 0) and deliberate teardown (the `RunEvent::Exit` handler sets a shutdown flag)
are filtered out.

### Frontend (renderer)

`@sentry/browser`, init in `app/src/lib/sentry.ts`, called from `main.tsx` before
anything mounts.

- **Renderer events go STRAIGHT to Sentry over HTTP** (`makeFetchTransport`), NOT
  through the `tauri-plugin-sentry` IPC bridge. That path silently dropped
  `@sentry/browser` 10.x error envelopes in packaged builds (0.4.18): the plugin's
  Rust `sentry-types` 0.42 parser rejected the newer envelope and discarded it with NO
  logging, while `flush()` falsely reported success. Native + replay were unaffected
  (they don't use that path), which is how it was isolated — release
  `houston-app@0.4.18` had the native panic and the supervisor crash but ZERO JS
  errors, alongside 70+ replays. Direct HTTP is proven from the Tauri webview
  (`csp: null`).
- The `tauri-plugin-sentry-api` npm package is no longer used on the JS side (dep
  still in `package.json`, removable with a lockfile update). The Rust
  `tauri-plugin-sentry` crate stays registered (harmless) — native crash reporting
  comes from `sentry::init`'s panic handler, not the plugin.
- The transport is wrapped to record each send's real HTTP status per event id;
  `captureException()` returns an event id ONLY after the fetch flush completes AND
  Sentry returns 2xx. The SDK's `GlobalHandlers` integration is stripped so uncaught
  errors are captured + toasted exactly once, by `main.tsx`'s explicit handlers (which
  need the id for the toast).
- **Session Replay**: `Sentry.replayIntegration()`, same direct HTTP transport.
  Privacy: `maskAllText` / `maskAllInputs` / `blockAllMedia` all on, so recordings
  capture layout + interaction shape, never chat text, prompts, agent/workspace names
  or file paths; `sendDefaultPii` stays `false`. Sampling:
  `replaysSessionSampleRate` 0.1, `replaysOnErrorSampleRate` 1.0 (bump session to 1.0
  while QA-ing replay). Only runs in DSN-baked builds.
- **Breadcrumbs**: `sentry-tracing` layer in `app/src-tauri/src/logging.rs` (app
  process); the engine's equivalent is the console/logger capture above. Every log line
  becomes a breadcrumb on that process's subsequent events; the last ~100 ride each
  crash.
  - **Privacy posture (deliberate, beta):** breadcrumbs AND event messages are
    intentionally NOT scrubbed — they can leak binary paths and agent names. Accepted
    for crash-debug value during beta (the visible Session Replay IS masked; this is
    about the crash payload). Revisit by adding a
    `sentry_tracing::layer().event_mapper(...)` + a `before_send` scrubber on the JS
    AND Rust clients **together** — never ship a partial scrubber that cleans the title
    and leaves breadcrumbs.

## Auto-report flow

`app/src/lib/error-toast.ts` shows a red "Houston, we have a problem" toast
immediately, captures the real `Error` (the original stack — `tauri.ts::surfaceError`
forwards it so engine errors group correctly instead of collapsing into one issue),
waits for delivery confirmation, then shows a green "Houston, report sent" toast with
the event ID prefix and a "Copy code" action copying the FULL 32-char id.

- The id is surfaced ONLY on a confirmed 2xx over the direct fetch transport. Before
  the direct-HTTP switch the IPC transport returned 200 unconditionally, which is why
  the toast could lie.
- Capture is decoupled from the toast: `{ toast: false }` engine calls still report
  unless they also pass `{ capture: false }`. `AbortError`s are filtered (cancelled
  requests aren't failures).
- The user never has to click "Report bug" when Sentry is reachable.

## Symbolication

- **Rust panics** are captured via the sentry panic handler in both the app and
  (historically) engine processes. Platform-split:
  - **Windows** resolves to file:line directly: `[profile.release] debug =
    "line-tables-only"` keeps line tables in the PDB, which CI uploads.
  - **macOS needs MORE than `line-tables-only`** — that flag leaves DWARF in the
    per-object `.o` files, NOT the linked Mach-O, so uploading the executable alone
    yields function names but NO file:line. CI runs `dsymutil` per binary right after
    the build and uploads the `.dSYM` alongside. Verify with `sentry-cli debug-files
    check <binary>.dSYM` (NOT the old `difutil check`, removed in sentry-cli 3.x).
  - **Source CODE context (both platforms):** CI passes `--include-sources` to
    `debug-files upload`, bundling the referenced source (Houston's own Rust +
    cargo-registry crates present in the checkout; not the Rust stdlib unless
    `rust-src` is installed). The repo is open source, so no exposure concern, and it
    brings native to parity with JS.
- **Engine stack traces need no upload pipeline** — frames arrive READABLE at capture
  time. The desktop sidecar compiles with `bun build --compile --sourcemap` (map
  embedded, stacks point at the original `.ts`); the pod/self-host bundles emit
  esbuild sourcemaps and run `node --enable-source-maps` (set per-command in the
  Dockerfile, NOT via `NODE_OPTIONS`, so it never leaks into node processes the
  agent's bash runs).
- **JS source maps**: Vite emits `*.js.map` via `build.sourcemap: "hidden"` (no
  `//# sourceMappingURL=` comment — production users can't view source in DevTools).
  With a hidden map, Sentry can only link `.js`→`.map` via a **Debug ID baked into the
  shipped bundle**, so the ID must be injected BEFORE Tauri embeds the frontend.
- **Build-time Debug ID injection**: `tauri.conf.json` →
  `beforeBuildCommand: "pnpm build && node scripts/sentry-inject.mjs"`. The script
  runs `sentry-cli sourcemaps inject app/dist` after the Vite build but before cargo
  embeds the assets, so the shipped bundle and uploaded map share identical byte
  offsets + Debug ID. No-op unless `SENTRY_DSN` is baked.
  - **Why here, not in CI:** injecting after Tauri packaged `app/dist` (pre-2026-06)
    shifted offsets and every in-app JS frame failed to symbolicate
    (`js_invalid_sourcemap_location`) even though the map uploaded fine.
    `beforeBundleCommand` is too late — assets embed during cargo build.
  - Do NOT add `@sentry/vite-plugin` (getsentry #916 risk); the CLI inject achieves
    the same result.
  - `@sentry/cli` needs an `onlyBuiltDependencies` allowlist in
    **`pnpm-workspace.yaml`** (pnpm 10 blocks its postinstall otherwise, the native
    binary never downloads, and the inject fails). NOT the `package.json` `pnpm`
    field — recent pnpm stopped reading it.

## Release CI uploads

After the Tauri build (which already injected the bundle), the macOS job runs
`sentry-cli releases new + set-commits + sourcemaps upload + debug-files upload`
against the signed executable + its `.dSYM`. Only the Tauri app SHELL is native now
— the engine is the bun-compiled sidecar with no Rust debug info, so there are no
engine `.dSYM`/`.pdb` uploads. Each Windows matrix arch uploads its own `app/dist`
maps (Vite content-hashes differ per arch) + `houston-app.exe` + `houston_app.pdb`
(underscore — Rust convention); the Linux job uploads its maps + the `houston-app`
ELF. `releases finalize` runs ONCE in the dedicated `finalize` job. CI steps
**upload only** — inject happens at build time. sentry-cli is the lockfile-pinned
`app/node_modules/.bin/sentry-cli`, not an unpinned `get-cli` download.

- **⚠️ The gate that must never regress:** the upload steps gate on
  `if: ${{ env.SENTRY_AUTH_TOKEN != '' }}`, and `SENTRY_AUTH_TOKEN` is defined at
  **job level** on `build-macos` / `build-windows` / `finalize`. It MUST stay
  job-level: a step's own `env:` block is NOT visible to that same step's `if:`
  (GitHub evaluates `if:` first), so defining it only in the step made the gate read
  empty and **silently skipped every upload on every run, official builds included** —
  the bug that left production stack traces minified. Same footgun fixed on the
  PostHog annotation step. Forks without the secret resolve to `''` and skip.
- **Version guard:** the `prep` job fails the release if the git tag ≠
  `app/package.json` version ≠ `app/src-tauri/Cargo.toml` version (all three feed the
  one `houston-app@<version>` release identity).
- `sentry-cli releases set-commits --auto` ties each release to its git commits so
  Sentry can flag "regression first seen in commit `abc1234`". Requires full git
  history (`fetch-depth: 0`, already set).

## Smoke shortcuts (DEV-ONLY)

- `Ctrl+Alt+Shift+J` throws a JS error from `app/src/lib/error-toast.ts` (source-map
  frame resolution check); `Ctrl+Alt+Shift+N` invokes a native Tauri command that
  panics with `sentry-native-stack-smoke-test` (app binary/PDB symbolication check).
  In DevTools: `window.__HOUSTON_SENTRY_SMOKE__.javascript()` / `.native()`.
- They only transmit when `SENTRY_SEND_IN_DEV` is set alongside a `SENTRY_DSN`;
  without the flag BOTH show the dev "no issue sent" toast (the native trigger checks
  `sentrySuppressedInDev` too, so it never tells you to "Check Sentry" when no client
  was initialized).
- **Compiled OUT of release builds** — the JS triggers behind `import.meta.env.DEV` in
  `main.tsx` (tree-shaken), the native command's panic path behind
  `#[cfg(debug_assertions)]` in `commands/diagnostics.rs`. Houston is open source and
  official binaries bake the prod DSN; shipping reachable error-injectors would let
  anyone flood the prod project.
- To verify symbolication on a SIGNED build (rare, only when the build/upload setup
  changes), temporarily drop both guards and cut a one-off tagged build (the
  disposable-version + `gh release delete --cleanup-tag` flow). The native smoke
  panics the **app** process — there is no engine-process smoke trigger; verify
  `runtime=engine` symbolication against a real engine crash.

## Operating it

- **Check Sentry BEFORE local logs** when a user reports a crash or weird behavior.
- **Daily triage queries** (Merge Agent Handler authenticated against Sentry):
  - Top 10 to fix today —
    `merge execute-tool sentry__list_issues '{"organization_slug":"houston-cd","project_slug":"houston-app","input_data":{"statsPeriod":"24h","query":"is:unresolved environment:production sort:freq","cursor":null}}'`
  - Regression watch — `query:"is:unresolved firstSeen:-7d environment:production"`
  - Progress made — `query:"is:resolved resolved:-7d environment:production"`
  - By release — `query:"release:houston-app@<version>"`
  - `statsPeriod` accepts `1h`, `24h`, `7d`, `14d`, `30d`. Add
    `query:"event.type:error"` if non-error events start arriving.
- **Sentry → Linear** is the Sentry-native integration (Merge can't install
  integrations): Sentry → Settings → Integrations → Linear → Install (OAuth, not
  CLI-drivable) → pick the target Linear team. A per-issue "Create Linear issue"
  button then appears, and resolving either side resolves the other.
- **Alert rules** (Sentry UI → Alerts → New Alert; Merge doesn't expose alert-rule
  CRUD): (1) new issue created → notify Slack `#reliability` (the trickle alert);
  (2) an issue's event count > 10x the prior 1-hour window → same channel (catches
  post-release regressions). Skip Sentry's default "every issue" email — Slack-only
  with these two thresholds.
