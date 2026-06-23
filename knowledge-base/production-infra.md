# Production Infrastructure

Four prod systems. All **dormant by default** — activate only when env vars set.

## Auto-updater (`tauri-plugin-updater`)

- **Config:** `tauri.conf.json` → `plugins.updater` (endpoint + pubkey)
- **Frontend:** `app/src/hooks/use-update-checker.ts` → checks on launch + every 30 min
- **UI:** `app/src/components/shell/update-checker.tsx` → update card w/ download, progress, details, relaunch
- **How:** Checks `latest.json` on GitHub Releases. Newer version? Downloads `.app.tar.gz`, verifies Ed25519 sig, replaces binary, relaunches.
- **Relaunch:** frontend captures the original app bundle path before install and calls `relaunch_app_from_path` after install. Do not use generic process relaunch after macOS updater install; it can resolve to the moved backup bundle and reopen the old version.
- **Notes:** release CI writes the notes payload into `latest.json.notes`; the update card renders those details as markdown via `update-notes.tsx`, which reuses the shared `MessageResponse` (Streamdown) renderer from `@houston-ai/chat` (no extra markdown dep) scoped compact for the small card.
- **Localized notes (en/es/pt):** the Tauri updater carries exactly ONE notes string (`latest.json.notes` → `update.body`), so the non-English translations ride inside it as a trailing `<!--houston-i18n:{"es":...,"pt":...}-->` comment. The `prep` job builds this from `.github/release-notes/<version>.md` (English base) plus optional `<version>.es.md` / `<version>.pt.md` siblings and ships it as a separate `update-notes` artifact (the GitHub release body + Slack stay clean English from `release-notes.md`). The frontend `selectUpdateNotes` (`app/src/lib/update-details.ts`) strips the comment, parses the JSON, and picks the translation for the live UI locale (`i18n.language`, already resolved from the workspace override → global pref), falling back to the English base. Degrades cleanly: any renderer that ignores HTML comments (Streamdown, GitHub, pre-0.4.19 builds) just shows English. Authoring convention: `.github/release-notes/README.md`.
- **Critical:** Update signing (Ed25519 via `TAURI_SIGNING_PRIVATE_KEY`) is SEPARATE from Apple code signing. Both needed.
- **Critical:** Users who install version WITHOUT updater can never auto-update. Ship updater in EVERY release.

## Analytics (`posthog-js`)

- **Purpose:** investor-grade usage + product decisions only. Avoid broad behavioral surveillance.
- **Pure JS:** runs in webview, no Rust plugin. Avoids Tokio runtime conflicts. Works in future Capacitor mobile too.
- **Init:** `app/src/lib/analytics.ts` — reads `POSTHOG_KEY` + `POSTHOG_HOST` via Vite `define` (baked at build time). Empty key → silent no-op. PostHog `init()` runs at module load for JS exception capture; product events fire after `analytics.init()` identifies the persistent install_id.
- **PostHog config:** autocapture, pageview/pageleave, session replay, heatmaps, dead clicks, rage clicks, and feature-flag `/flags` calls are disabled in code. Enable any of these only with a specific question.
- **Install identity:** `app/src/lib/install-id.ts` — mints a UUID on first launch, persists via `tauriPreferences` (`install_id` key). Used as anonymous PostHog `distinct_id` until sign-in, then `analytics.alias/identify` merges history to the Supabase user.
- **User identity:** `distinct_id` is the stable Supabase user id. `email` and `email_domain` are PostHog person properties only, used for lookup, company-domain filtering, and B2B usage checks.
- **Debug/Release:** `import.meta.env.DEV` → `is_debug` super property. Filter it out in dashboards to exclude dev activity.
- **Super properties:** `app_version`, `app_os` (normalized: `macos` / `windows` / `linux` / `unknown`), `os` (raw legacy `navigator.platform`), `install_id`, `is_debug`.
- **Privacy:** no workspace names, agent names, raw prompts, raw message text, file paths, session keys, or raw error text in PostHog event props. Email is allowed only as a person property after auth, never as an event property.

### Event surface
- **Growth:** `app_active` (once per install per UTC day), `install_created`
- **Activation:** `workspace_created`, `provider_configured`, `agent_created`, `chat_message_sent`, `chat_message_received`
- **Engagement:** `mission_created`
- **Reliability:** `session_failed`, `app_error_shown`, PostHog `$exception` from JS global handlers + React error boundary

**Activation milestone:** `chat_message_received` — user sent a message and got a reply. Configure as the activation event in PostHog; all retention/funnel insights key off it.

### Adding event
```typescript
import { analytics } from "@/lib/analytics";
analytics.track("event_name");
```
Event names + props are allowlisted in `AnalyticsEventName` / `AnalyticsProperty`. Add only if tied to a dashboard question. Fire-and-forget. Never throws/blocks. Not configured → silent no-op.

**Analytics in `app/` only** — never in `ui/`. Library boundary rule applies.

### PostHog dashboards — canonical set (tag `canonical-2026-05`)

8 themed dashboards, each opens with one question. Numeric prefix sets the sidebar order to match daily reading flow:

1. **Houston / 1. Acquisition** (id 1631626) — where users come from. Installs over time + UTM-campaign + normalized `app_os` breakdown
2. **Houston / 2. Activation** (id 1631629) — where the funnel leaks. Install → activation funnel, time-to-activation, onboarding completion
3. **Houston / 3. Engagement** (id 1631631) — DAU/WAU/MAU, stickiness, messages-per-active-day
4. **Houston / 4. Retention** (id 1631635) — weekly cohort retention, growth accounting, attribution-cohorted retention
5. **Houston / 5. Feature Adoption** (id 1631636) — per-feature usage (skill_used, tab_opened, integration_connected, routine_executed, update funnel)
6. **Houston / 6. Reliability** (id 1631644) — app_error_shown by error_kind, session failures, error rate by app_version
7. **Houston / 7. AI Usage** (id 1631647) — LLM cost / latency / errors / generation calls (uses PostHog LLM-observability auto-events)
8. **Houston / 8. B2B** (id 1631648) — multi-user company domains, messages-by-domain

Filter `is_debug != true` is applied at the project level via the `Internal / Test users` cohort (exclude this cohort from every insight as a project-wide convention).

Old dashboards (`Houston Growth + Reliability` 1517531, `Houston Acquisition Funnel` 1522835, `My App Dashboard` 1507849) are tagged `legacy-pre-2026-05` and unpinned. Their insights live on, mostly cross-attached to the new dashboards. Delete the old shells whenever comfortable — no insights will be lost.

Reading guide: `knowledge-base/data-rituals.md`.

Do NOT use raw autocapture event lists for product decisions. If a question needs click-level data, prefer one temporary, named event and delete it after the decision.

### Pulling a contact list of users on stale versions

The dashboard tile shows COUNTS. To actually reach people on old versions, use PostHog **Persons** (not Insights):

1. Persons → "New cohort" (or ad-hoc filter)
2. Filter: `app_version` (super property, type **Event property**) `is not` `<latest version>` (e.g. `0.4.3`). Repeat with `is_set` to exclude any persons missing the property.
3. Optionally also filter `email is_set` — only signed-in users have an email; anonymous installs cannot be emailed.
4. Export the cohort as CSV. Columns of interest: `email`, `email_domain`, `app_version`, `install_os`.

Caveats:
- `app_version` is a SUPER property attached to events, not a person property. So filtering by it on Persons works only if PostHog has seen that person fire an event recently in that version. Long-dormant users may not show up.
- Anonymous users (never signed in) have no `email`. They are the "can't reach by email" bucket; their count on the dashboard tile vs the exportable cohort = the unreachable delta.
- The `is_debug != true` filter applies to the dashboard tile but not to the Persons export — add it to the cohort definition manually.

### Attribution bridge (website → app install)

Implemented in `website/src/welcome/` + `app/src/App.tsx` first-launch path. End-to-end flow documented in `growth/utm-conventions.md`. Summary:

1. Website tracks UTMs as `$initial_utm_*` person properties on the anonymous visitor (`person_profiles: 'always'` in `base.njk` makes this work for anonymous users).
2. App on first launch (`isNew=true`) opens `https://gethouston.ai/welcome?install_id=<id>` via `tauriSystem.openUrl`.
3. The `/welcome` page calls `posthog.identify(install_id)` which merges the anonymous website person — with its UTMs — into the install identity.
4. All subsequent app events carry the original UTMs as person properties.

Per-event short URLs (e.g. `gethouston.ai/yc-demo-day-2026`) live in `website/src/_redirects` and 302 to the UTM-laden landing page. Add one line per campaign.

### BigQuery export (optional)
PostHog → BigQuery plugin → target GCP project (burns credits). SQL-queryable event history forever, immune to PostHog retention limits. Useful for investor-update analytics.

## Houston Cloud (GCP project `gethouston`, us-east1)

_The cloud control-plane is now the v3 TypeScript host (`packages/host`), not the Rust engine; per-turn Cloud Run. See `convergence/README.md` + `cloud/code-execution.md`._

Live beta. Four deployables; agent compute scales to zero (see
`cloud/unit-economics.md` for the cost model, `cloud/code-execution.md` for the
security architecture):

| Service | Runs on | Image | Deploy |
|---|---|---|---|
| `control-plane` | GKE Autopilot `houston-cloud`, ns `houston-system`, LB `34.74.83.237` | `houston/control-plane:v7` | `gcloud builds submit --config cloud/cloudbuild.yaml` then `kubectl apply -f cloud/k8s/control-plane.yaml` |
| `houston-turn-runtime` | Cloud Run (per-turn agents; IAM-gated, concurrency=1) | `houston/runtime:v6` | `cloud/scripts/06-runtime.sh` |
| `houston-code-sandbox` | Cloud Run (untrusted code; zero-IAM SA, deny-all-egress VPC) | `houston/code-sandbox:v2` | `cloud/scripts/05-code-sandbox.sh` |
| `houston-web` | Cloud Run (nginx SPA + `/api` proxy → control plane) | `houston/web:v11` | build SPA with `VITE_CONTROL_PLANE_URL=/api` + `SUPABASE_URL`/`SUPABASE_ANON_KEY` baked, then `gcloud builds submit packages/web --tag …/web:vN` + `gcloud run services update houston-web --image …` |

Rules learned in production:
- **`cloud/k8s/control-plane.yaml` IS the live truth** — image tag, turn env
  (`CP_TURN_RUNTIME_URL`, `CP_GCS_BUCKET`, `CP_DEFAULT_RUNTIME`), agent image.
  Never let it drift: a stale `kubectl apply` silently wipes live config.
- **Zero-downtime deploys**: the CP drains on SIGTERM
  (`packages/host/src/shutdown.ts`) and the Deployment rolls with
  `maxUnavailable: 0` + preStop sleep + a PDB. Single replica is deliberate
  (in-memory turn relay); multi-replica HA needs that state on a shared bus.
- **Secrets**: app-layer tokens are Secret Manager `houston-code-sandbox-token`
  / `houston-turn-token`. Create values with `printf '%s' "$(openssl rand -hex 32)"`
  — `openssl | gcloud` appends a newline that desyncs both sides.
- **DB migrations**: additive only (745 real users); apply with
  `CP_DATABASE_URL=… bun packages/host/scripts/run-migration.ts <file>`
  (no psql needed).
- **gcloud auth**: org policy re-prompts ~hourly; non-interactive shells then
  fail with "Reauthentication failed" — rerun `gcloud auth login`. The account
  with `gethouston` IAM is `julian@jointaxflow.ai`.

## Auth (`@supabase/supabase-js` + Google SSO)

- **Session storage:** CI releases use macOS Keychain / Windows Credential Manager via the `keyring` crate (`app/src-tauri/src/auth.rs`). Local builds use browser storage scoped per worktree to avoid macOS Keychain prompts from changing local signatures. Override with `HOUSTON_AUTH_STORAGE=keychain` or `HOUSTON_AUTH_STORAGE=browser`.
- **Flow:** One-click Google sign-in → system browser → OAuth redirect to `houston://auth-callback` → `tauri-plugin-deep-link` forwards to frontend → Supabase PKCE exchange → session persisted in configured auth storage. Full diagram + code pointers: `knowledge-base/auth.md`.
- **Gating:** `isAuthConfigured()` checks whether `SUPABASE_URL` + `SUPABASE_ANON_KEY` are baked in. Unconfigured builds skip the sign-in screen entirely.
- **PostHog merge:** On sign-in, `analytics.alias(userId, { email })` merges anonymous install_id history to the identified user and sets `email` / `email_domain` person properties; on sign-out, `analytics.reset()` returns to anonymous.

## Crash reporting (`sentry` + `tauri-plugin-sentry`)

- **Org / Project:** Sentry org `houston-cd` → Team `houston-eng` → Project `houston-app` (platform `javascript-react` — ONE project for THREE runtimes: the renderer (JS), the Tauri app process (Rust), and the `houston-engine` subprocess (Rust). Events carry a `runtime` tag — `engine` from the engine, `engine-supervisor` from a supervised crash — to tell them apart). Console: https://houston-cd.sentry.io.
- **Backend (app process):** Initialized in `lib.rs` BEFORE other plugins. Conditional on `option_env!("SENTRY_DSN")`. Explicitly sets `environment` to `production` for release builds and `development` for `pnpm tauri dev`. `release` is `houston-app@<CARGO_PKG_VERSION>` (built explicitly so the SAME string can be forwarded to the engine) — same string release.yml uses for sentry-cli uploads, so events resolve against the uploaded sourcemaps/debug-files.
- **Engine subprocess:** `houston-engine` self-inits Sentry in `engine/houston-engine-server/src/main.rs::init_sentry`, gated on a runtime `SENTRY_DSN` env var. The app injects `SENTRY_DSN` + `SENTRY_RELEASE` (= `houston-app@<version>`) + `SENTRY_ENVIRONMENT` into the engine's env at spawn (`lib.rs` engine_env), so engine events land in the SAME project under the SAME release (resolving against the `houston-engine` debug files CI uploads) tagged `runtime=engine`. The open-source engine ships Sentry-capable but DORMANT — empty DSN = silent no-op; any self-hoster sets their own DSN, none is baked in. `sentry-tracing` is wired into the engine's `init_tracing` registry (ERROR → event, WARN/INFO → breadcrumb), mirroring `logging.rs`. Engine builds use the rustls (not native-tls) Sentry transport so the musl/Linux engine still links.
- **Engine crash supervisor:** `engine_supervisor.rs` captures a Sentry event (`runtime=engine-supervisor`, `source=engine_crash`, fingerprinted so a crash-loop is one issue) when the engine subprocess exits abnormally (non-zero / signal) while NOT shutting down — the one signal that survives an engine too-dead to self-report. Graceful stdin-EOF shutdown (exit 0) and deliberate teardown (the `RunEvent::Exit` handler sets a shutdown flag) are filtered out.
- **Frontend:** `@sentry/browser`, init in `app/src/lib/sentry.ts`, called from `main.tsx` before anything else mounts. Renderer events go STRAIGHT to Sentry over HTTP (`makeFetchTransport`), NOT through the `tauri-plugin-sentry` IPC bridge. **Why (learned the hard way in 0.4.18):** the IPC path silently dropped `@sentry/browser` 10.x error envelopes in packaged builds — the plugin's Rust `sentry-types` (0.42) parser rejected the newer envelope and discarded it with NO logging, so JS errors never reached Sentry while `flush()` falsely reported success. Native + replay were unaffected because they don't use that path (native = the `sentry` crate panic handler; replay already went direct HTTP), which is exactly how we isolated it: under release `houston-app@0.4.18`, Sentry had the native panic + the engine-supervisor crash but ZERO JS errors, while 70+ replays (direct HTTP) landed fine. Direct HTTP is proven to work from the Tauri webview (`csp: null`). The `tauri-plugin-sentry-api` npm package is no longer used on the JS side (dep still in `package.json`; removable in a follow-up with a lockfile update). The Rust `tauri-plugin-sentry` crate stays registered (harmless) — native crash reporting comes from `sentry::init`'s panic handler, not the plugin. The transport is wrapped (`sentry.ts`) to record each send's real HTTP status per event id; `captureException()` returns an event id (→ the green toast) ONLY after the fetch flush completes AND Sentry returns a 2xx. The SDK's `GlobalHandlers` integration is stripped so uncaught errors are captured + toasted exactly once, by `main.tsx`'s explicit handlers (which need the id for the toast).
- **Dev suppression (`SENTRY_SEND_IN_DEV`, HOU-469):** the frontend HARD-disables Sentry in a dev build (`pnpm tauri dev` or the `packages/web` dev server) unless `SENTRY_SEND_IN_DEV` is truthy (`1`/`true`/`yes`/`on`, case- and whitespace-insensitive). `sentrySuppressedInDev` in `app/src/lib/sentry.ts` (= `import.meta.env.DEV && !SEND_IN_DEV`, where `SEND_IN_DEV` is parsed from the `__SENTRY_SEND_IN_DEV__` Vite define wired in BOTH `app/vite.config.ts` and `packages/web/vite.config.ts`) makes `initSentry` bail with NO client at all — not the soft `environment: development` tag — so a developer running with the prod `SENTRY_DSN` baked never pollutes the prod `houston-app` project (quota, the "new issue" Slack alert, issue-list clutter). The parser + the dev-only `info` toast spec live in `app/src/lib/sentry-dev.ts`; that "You're in dev mode, no issue sent" toast (English-only, deliberately NOT i18n'd — it is dev-facing copy) replaces the green "report sent" toast in `error-toast.ts` and the native-smoke path in `sentry-smoke.ts`. Release builds ignore the flag entirely (`import.meta.env.DEV` is false). Scope note: only the frontend (TS) layer is gated in this repo — the live path is the web app; the Rust app/engine Sentry layers (legacy here) are unchanged.
- **Session Replay:** `Sentry.replayIntegration()` in `app/src/lib/sentry.ts`, using the SAME direct HTTP transport as every other renderer event. (Historical note: replay used to need a dedicated split transport because everything else went through the Rust IPC bridge, which couldn't carry `replay_event` / `replay_recording` envelopes; now that ALL renderer traffic is direct HTTP, the split + the `isReplayEnvelope` predicate were removed.) **Privacy:** `maskAllText` / `maskAllInputs` / `blockAllMedia` are all on, so recordings capture layout + interaction shape, never chat text, prompts, agent/workspace names or file paths; `sendDefaultPii` stays `false`. **Sampling:** `replaysSessionSampleRate` 0.1, `replaysOnErrorSampleRate` 1.0 (bump session to 1.0 while QA-ing replay). Replay only runs in DSN-baked builds (CI release); dev/forks never record. No CSP change needed — `tauri.conf.json` has `csp: null`.
- **Breadcrumbs:** `sentry-tracing` layer wired into BOTH `app/src-tauri/src/logging.rs` (app process) and `engine/houston-engine-server/src/main.rs::init_tracing` (engine process). Every `tracing::info!`/`warn!`/`error!` becomes a breadcrumb on that process's subsequent Sentry events (ERROR also fires a standalone event). Last ~100 log records auto-ride with each crash. **Privacy posture (deliberate, beta):** breadcrumbs AND event messages are intentionally NOT scrubbed — they can leak binary paths and agent names. We accept this tradeoff for crash-debug value during beta (the visible Session Replay IS masked; this is about the crash payload, not the recording). Revisit by adding a `sentry_tracing::layer().event_mapper(...)` + a `before_send` scrubber on both the JS and Rust clients together — do NOT ship a partial scrubber that cleans the title but leaves breadcrumbs. **Volume note:** every `tracing::error!` becomes a standalone Sentry event. Most engine error sites are one-shot, but a persistently-failing scheduled routine (`engine/houston-engine-core/src/routines/scheduler.rs`) can emit one event per cron fire. Sentry's server-side grouping collapses identical messages, so this is acceptable for beta; if a noisy routine becomes a problem, downgrade those specific `tracing::error!` sites to a fingerprinted `sentry::with_scope` capture (like the supervisor's `engine-subprocess-exit`) or a custom `event_filter`.
- **Auto-report flow:** `app/src/lib/error-toast.ts` shows a red "Houston, we have a problem" toast immediately, captures the real `Error` (the original stack — `tauri.ts::surfaceError` forwards it so engine errors group correctly instead of collapsing into one issue), waits for delivery confirmation, then shows a green "Houston, report sent" toast with the event ID prefix + a "Copy code" action that copies the FULL 32-char id (so it can be quoted to support / looked up in Sentry). The id is surfaced ONLY on a confirmed 2xx from Sentry over the direct fetch transport (the wrapper in `sentry.ts` records per-event HTTP status; `captureException` gates on flush AND accept) — so the toast cannot show an id Sentry didn't accept. (Before the direct-HTTP switch the IPC transport returned 200 unconditionally, which is why the toast could lie — see the Frontend bullet.) Capture is decoupled from the toast: `{ toast: false }` engine calls still report to Sentry unless they also pass `{ capture: false }` (fire-and-forget / self-reporting paths); `AbortError`s are filtered (cancelled requests aren't failures). User never has to click "Report bug" when Sentry is reachable.
- **"Send feedback" (the catch-net):** Always-available menu item in the sidebar user-menu dropdown. Opens `feedback-dialog.tsx` with a textarea. Submits to the same Tauri `report_bug` command Linear-ticket flow, with the user's typed message in `BugReportPayload.user_message` so `format.rs` leads the issue title + description with it ("Houston feedback: ..." instead of "Houston bug: ..."). For things Sentry can't see — UX confusion, feature requests, soft errors.
- **Rust panics:** Captured via the sentry panic handler (app process AND engine process). Symbolication is platform-split:
  - **Windows** resolves to file:line directly: `[profile.release] debug = "line-tables-only"` (workspace `Cargo.toml`) keeps line tables in the PDB, which CI uploads.
  - **macOS** needs MORE than `line-tables-only`: that flag leaves DWARF in the per-object `.o` files, NOT in the linked Mach-O, so uploading the executable alone yields function names but NO file:line. CI therefore runs `dsymutil` per binary (app + both engine triples) right after the build to pack a `.dSYM`, and uploads the `.dSYM` alongside the executable. Verify with `sentry-cli debug-files check <binary>.dSYM` (CI logs this; non-fatal warning if it lacks debug info — note the subcommand is `debug-files check`, NOT the old `difutil check` removed in sentry-cli 3.x). Do NOT rely on `line-tables-only` alone on macOS.
  - **Source CODE context (both platforms):** symbolication gives function + file:line, but Sentry shows the actual source LINES inline only if a source bundle is uploaded too. CI passes `--include-sources` to `debug-files upload`, which bundles the referenced source (Houston's own Rust + cargo-registry crates present in the build checkout; NOT the Rust stdlib unless `rust-src` is installed) into Sentry. The repo is open source so there's no exposure concern, and it brings native to parity with JS (whose maps already inline `sourcesContent`). Without the flag you still get file:line, just no code snippet.
- **JS source maps:** Vite emits `*.js.map` next to bundled JS via `build.sourcemap: "hidden"` (no `//# sourceMappingURL=` comment — production users can't view source via DevTools). With a hidden map, Sentry can only link `.js`→`.map` via a **Debug ID baked into the shipped bundle**, so the ID must be injected BEFORE Tauri embeds the frontend.
- **Build-time Debug ID injection:** `app/src-tauri/tauri.conf.json` → `beforeBuildCommand: "pnpm build && node scripts/sentry-inject.mjs"`. The script (`app/scripts/sentry-inject.mjs`, using the `@sentry/cli` devDep) runs `sentry-cli sourcemaps inject app/dist` after the Vite build but before cargo embeds the assets, so the shipped bundle and the uploaded map share identical byte offsets + Debug ID. No-op unless `SENTRY_DSN` is baked in (dev/forks skip it). **Why here, not in CI:** injecting after Tauri packaged `app/dist` (the pre-2026-06 behavior) shifted offsets and every in-app JS frame failed to symbolicate (`js_invalid_sourcemap_location`) even though the map uploaded fine. `beforeBundleCommand` is too late — assets embed during cargo build. Do NOT add `@sentry/vite-plugin` (getsentry #916 risk); the CLI inject achieves the same result. `@sentry/cli` needs an `onlyBuiltDependencies` allowlist in `pnpm-workspace.yaml` (pnpm 10 blocks its postinstall otherwise — without it the native `sentry-cli` binary never downloads and the inject fails). This setting lives in `pnpm-workspace.yaml`, NOT the `package.json` `pnpm` field: recent pnpm stopped reading that field ("The pnpm field in package.json is no longer read").
- **Release.yml uploads:** After Tauri build (which has already injected the bundle), the macOS job runs `sentry-cli releases new + set-commits + sourcemaps upload + debug-files upload` against the signed Tauri app executable + its `.dSYM` plus both `target/{aarch64,x86_64}-apple-darwin/release/houston-engine` + their `.dSYM`s. Each Windows matrix arch uploads its own `app/dist` maps (Vite content-hashes differ per arch) + `houston-app.exe` + `houston_app.pdb` + `houston-engine.exe` + `houston_engine.pdb` (PDB filename has underscore — Rust convention). `releases finalize` runs ONCE in the dedicated `finalize` job (after both build jobs upload), not per-build. The CI steps **upload only** (no `inject` — that happens at build time). sentry-cli is the lockfile-pinned `app/node_modules/.bin/sentry-cli` (via the `@sentry/cli` devDep), not an unpinned `get-cli` download.
  - **⚠️ The gate that must never regress:** the upload steps gate on `if: ${{ env.SENTRY_AUTH_TOKEN != '' }}`, and `SENTRY_AUTH_TOKEN` is defined at **job level** on `build-macos` / `build-windows` (and `finalize`). It MUST stay job-level: a step's own `env:` block is NOT visible to that same step's `if:` (GitHub evaluates `if:` before step env), so defining it only in the step made the gate read empty and **silently skipped every upload on every run, official builds included** — the bug that left production stack traces minified/hex despite the maps existing. Same footgun fixed on the PostHog annotation step. Forks without the secret still resolve to `''` and skip.
  - **Version guard:** the `prep` job fails the release if the git tag ≠ `app/package.json` version ≠ `app/src-tauri/Cargo.toml` version (all three feed the one `houston-app@<version>` release identity).
- **Sentry smoke shortcuts (DEV-ONLY):** `Ctrl+Alt+Shift+J` throws a JS error from `app/src/lib/error-toast.ts` (source-map frame resolution check); `Ctrl+Alt+Shift+N` invokes a native Tauri command that panics with `sentry-native-stack-smoke-test` (app binary/PDB symbolication check); in DevTools the same hooks are `window.__HOUSTON_SENTRY_SMOKE__.javascript()` / `.native()`. Because dev builds now suppress Sentry by default (see Dev suppression in the Frontend bullet), both triggers only actually transmit when `SENTRY_SEND_IN_DEV` is set; without it each shows the dev "no issue sent" toast and nothing leaves the machine (the native path checks `sentrySuppressedInDev` too, so it never tells you to "Check Sentry" when no client was initialized). **These are compiled OUT of release builds** — the JS triggers are gated behind `import.meta.env.DEV` in `main.tsx` (tree-shaken in prod) and the native command's panic path behind `#[cfg(debug_assertions)]` in `commands/diagnostics.rs` (no-op in release). Reason: Houston is open source and official release binaries bake the prod `SENTRY_DSN`, so shipping reachable error-injectors would let anyone flood the prod Sentry project. **To verify symbolication on a SIGNED build** (rare — only when the build/upload setup changes), temporarily drop the `import.meta.env.DEV` guard + the `debug_assertions` cfg and cut a one-off tagged build (the disposable-version + `gh release delete --cleanup-tag` flow). Note: the native smoke panics the **app** process — there is no dedicated engine-process smoke trigger; verify engine (`runtime=engine`) symbolication against a real engine crash.
- **Check:** User reports crash or weird behavior → Sentry dashboard BEFORE local logs.

### Daily ritual (reliability engineer + product daily-ask)

Standing prompts to a Claude Code session with Merge Agent Handler authenticated against Sentry:

- **Top 10 to fix today:** `merge execute-tool sentry__list_issues '{"organization_slug":"houston-cd","project_slug":"houston-app","input_data":{"statsPeriod":"24h","query":"is:unresolved environment:production sort:freq","cursor":null}}'` — sort by frequency, filter unresolved + production. First 10 results = the queue.
- **Regression watch:** repeat with `query:"is:unresolved firstSeen:-7d environment:production"` to see what's NEW since the previous weekly cut.
- **Progress made:** `query:"is:resolved resolved:-7d environment:production"` — list of issues closed this week, for the weekly retro / status update.
- **By release:** `query:"release:houston-app@<version>"` to scope to a specific release when triaging post-deploy regressions.

`statsPeriod` accepts `1h`, `24h`, `7d`, `14d`, `30d`. Combine with `query:"event.type:error"` if non-error events ever start coming in.

### Sentry → Linear (issue triage automation)

Sentry-native integration handles this (Merge doesn't expose integration installation — OAuth handshake only). One-time setup in Sentry web UI:

1. **Sentry → Settings → Integrations → Linear → Install** (OAuth handshake; can't be CLI-driven).
2. Pick the target Linear team (reuse `LINEAR_TEAM_ID` from the in-app bug reporter, or split into a separate "Crashes" team).
3. Per-issue "Create Linear issue" appears on every Sentry issue. Resolving the Linear ticket auto-resolves the Sentry issue (and vice versa).

For bulk batching, the reliability engineer's daily ritual is: open the top-10 queue, "Create Linear issue" on each, get back to coding.

### Alert rules

Two rules to set up via Sentry UI (Alerts → New Alert), since Merge doesn't expose alert-rule CRUD:

1. **New issue created → Slack.** Condition: a new issue is created. Action: notify Slack channel `#reliability` (or whatever the reliability engineer owns). This is the trickle alert.
2. **Error rate spike after release.** Condition: number of events for an issue is more than `10x` the prior 1-hour window. Action: notify same Slack channel. This catches regressions from a release.

Skip Sentry's default "every issue" email alert — it's too noisy. Slack-only with the two threshold rules above. Reliability engineer reads Slack; the noise stays out of the founder's inbox.

### Releases + commits

`sentry-cli releases set-commits --auto` ties each release to its git commits, so Sentry can flag "regression first seen in commit `abc1234`" automatically. Requires the runner to have full git history (release.yml has `fetch-depth: 0` already). On the very first release after wiring this up, `set-commits` may warn — safe to ignore, future releases will diff against this one.

## In-app bug reports (Linear issue creation)

- **Frontend:** `app/src/lib/error-toast.ts` shows the "Report bug" action. `app/src/lib/bug-report.ts` sends a provider-neutral bug report object with recent frontend + backend logs.
- **Native delivery:** `app/src-tauri/src/bug_report/` creates a Linear issue with `reqwest` against `https://api.linear.app/graphql`. Do not post from the webview; the Linear API key does not belong in the JS bundle.
- **Config:** `LINEAR_API_KEY` + `LINEAR_TEAM_ID` are read from runtime env, `app/.env.local`, `app/src-tauri/.env.local`, and `option_env!()` for release builds. CI passes them in `.github/workflows/release.yml`. Release builds embed the key in the native app, so never use a broad Linear key. Use a key restricted to "Create issues" and the target team only. Bug reports look up and apply the `User Bug` label; override with optional `LINEAR_BUG_LABEL_NAME`.
- **Local smoke:** `cd app/src-tauri && LINEAR_API_KEY=... LINEAR_TEAM_ID=... cargo test creates_real_linear_issue_when_env_is_set -- --ignored` creates one real Linear issue.

## Required env vars

Shell (local builds) AND GitHub Secrets (CI):

| Var | Purpose | Source |
|-----|---------|--------|
| `APPLE_SIGNING_IDENTITY` | Developer ID | Apple Developer portal → Certificates |
| `APPLE_API_KEY` | App Store Connect key ID | ASC → Users → Keys |
| `APPLE_API_KEY_PATH` | Path to `.p8` key | Downloaded when creating key |
| `APPLE_API_ISSUER` | ASC issuer UUID | ASC → Users → Keys |
| `TAURI_SIGNING_PRIVATE_KEY` | Ed25519 key for update signing | `pnpm tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for above | Set during gen |
| `POSTHOG_KEY` | PostHog project API key (client-side, public-safe) | PostHog → Project settings → Project API key |
| `POSTHOG_HOST` | PostHog ingest host | `https://us.i.posthog.com` (or EU equivalent) |
| `SUPABASE_URL` | Supabase project URL | Supabase → Project settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (public-safe, RLS-gated) | Supabase → Project settings → API → Project API keys → `anon` `public` |
| `LINEAR_API_KEY` | Create in-app bug-report issues | Linear → Settings → Account → Security & Access → Personal API keys |
| `LINEAR_TEAM_ID` | Target team for in-app bug-report issues | Linear command menu → Copy model UUID on the target team |
| `SENTRY_DSN` | Crash reporting DSN baked into the app at build time | Sentry → houston-cd → houston-app → Settings → Client Keys (DSN) |
| `SENTRY_SEND_IN_DEV` | Opt-in (truthy `1`/`true`/`yes`/`on`) to send Sentry events from a dev build; unset → dev builds suppress Sentry so dev errors don't pollute the prod project (HOU-469). Ignored by release builds. | Set locally only when testing crash reporting in `pnpm tauri dev` / the web dev server |
| `SENTRY_AUTH_TOKEN` | sentry-cli auth for source map + debug symbol upload in release.yml. Scopes: `project:releases`, `project:read`, `org:read`. Skip the upload step entirely when unset (forks, personal builds). | Sentry → Settings → Auth Tokens |

CI also needs as Secrets:
- `APPLE_CERTIFICATE` — base64 `.p12`
- `APPLE_CERTIFICATE_PASSWORD` — password for `.p12`

**Never hardcode.** Read via `option_env!()` in Rust (compile-time). Pass as env vars in CI.

## CI/CD (GitHub Actions)

- **Workflow:** `.github/workflows/release.yml`
- **Trigger:** Push tag matching `v*`
- **Output:** Draft GitHub Release w/ signed+notarized DMG + signed MSI + `latest.json`
- **Duration:** ~25-30 min wall-clock (mac + win run in parallel; mac is the long pole at ~25 min including Apple notarization).
- **Draft = QA gate.** Users don't see until published on GitHub.

### Job graph
```
prep (ubuntu, ~30s)               creates empty draft + release-notes.md artifact
  ├── build-macos (mac, ~25m)     builds, signs, notarizes, uploads DMG/tar/sig/latest.json
  └── build-windows (win, ~20m)   builds, uploads MSI + .sig
        └── finalize (ubuntu, ~30s) extends latest.json with windows-x86_64 entry, posts Slack
```
Mac and Windows run in parallel because they only need the empty draft `prep` creates, not each other's output. `finalize` stitches `latest.json` together (the macOS-only base from build-macos plus the Windows entry assembled from the MSI .sig in the draft) and posts the team Slack notification. Slack lives in `finalize` (not Windows) because it needs `release-notes.md` and the file is published as a workflow artifact by `prep`.

## macOS Universal (arm64 + Intel)

Houston ships ONE DMG that runs natively on Apple Silicon AND Intel. Same app, same download, same update channel.

### How it works
- `release.yml` builds `houston-engine` TWICE — once per real triple (`aarch64-apple-darwin`, `x86_64-apple-darwin`).
- `build.rs` stages both as per-triple sidecars: `src-tauri/binaries/houston-engine-aarch64-apple-darwin` + `-x86_64-apple-darwin`. Tauri universal build requires per-triple sidecars (NOT a pre-lipo'd fat binary).
- `tauri-action` invoked with `--target universal-apple-darwin`. It runs cargo twice, then `lipo`s the outputs into one fat `.app`. Bundle lands at `target/universal-apple-darwin/release/bundle/`.
- Verification step runs `lipo -info` on the embedded engine sidecar and fails the release if either slice is missing.
- `latest.json` ships FOUR platform keys (`darwin-aarch64`, `darwin-aarch64-app`, `darwin-x86_64`, `darwin-x86_64-app`) all pointing at the same tarball + signature. Intel users on older Houston installs check `darwin-x86_64` — if that key is absent they NEVER see the update prompt.
- `bundle.macOS.minimumSystemVersion = 10.15` in `tauri.conf.json` — required for Intel Macs old enough to matter.

### Engine-only release
`.github/workflows/engine-release.yml` (tag `engine-v*`) builds `houston-engine` standalone for Linux (arm64 + x86_64 musl) and macOS (arm64 + Intel). Four artifacts total.

### Local universal build
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cargo build --release --target aarch64-apple-darwin -p houston-engine-server
cargo build --release --target x86_64-apple-darwin -p houston-engine-server
cd app && pnpm tauri build --target universal-apple-darwin
```
Output: `target/universal-apple-darwin/release/bundle/{macos,dmg}/`.

### Dev is single-arch
`pnpm tauri dev` stays single-triple (whatever the host is). `build.rs` falls back to `target/release/` when a per-triple path is missing, so nothing breaks.

### Do NOT break Intel without warning
Removing an arch from `release.yml` (or dropping `darwin-x86_64*` keys from `latest.json`) strands every Intel user silently. Migrate with a deprecation release first.
