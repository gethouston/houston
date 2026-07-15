# Production Infrastructure

Four prod systems. All **dormant by default** — activate only when env vars set.

> **Updated: the desktop engine is the bun-compiled TypeScript host — the Rust `engine/` was removed.** The TS engine self-reports to Sentry (see "Engine (TS host + runtime)" below): the app still injects `SENTRY_*` into the sidecar at spawn (same contract as the Rust era), and the engine-pod image bakes the DSN for the managed cloud. References to `engine/houston-*` crates below are historical.

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
- **PostHog config:** pageview/pageleave, session replay, heatmaps, and feature-flag `/flags` calls are disabled in code. Autocapture is ON but fully masked (`mask_all_text` + `mask_all_element_attributes` — selectors/positions only, no user content) because rage-click and dead-click capture require it; the specific question that turned it on (2026-07): where does the v0.5.9 onboarding strand users? Enable anything further only with a specific question.
- **Install identity:** `app/src/lib/install-id.ts` — mints a UUID on first launch, persists via `tauriPreferences` (`install_id` key). Used as the PostHog `distinct_id` for the whole app lifetime — it STAYS the `distinct_id` after sign-in (the `/welcome` UTM bridge and the sequential onboarding funnel depend on it); sign-in aliases the Firebase uid onto it (merging the same human across devices) and attaches the identity as person properties, without re-pointing the distinct_id.
- **User identity:** on sign-in `analytics.identifyUser` does two things: (1) `alias(firebase_uid)` stitches a human's per-device / per-reinstall persons into ONE PostHog person (each keeps its own `install_id` distinct_id; the shared alias merges them), so retention/WAU dedupe natively; (2) stamps `firebase_uid` (the GCP Identity Platform / Firebase `uid`) as a PERSON PROPERTY — the queryable join key to the auth system. `email` and `signup_date` (set-once) are person properties too, used for lookup and company-domain filtering. `distinct_id` stays the device `install_id`. **Identity discontinuity:** analytics now aliases the Firebase uid, not the old Supabase id, so historical joins keyed on the retired `supabase_user_id` no longer stitch to post-migration persons — an intentional break at the GCIP cutover (see `knowledge-base/auth-migration.md`).
- **Debug/Release:** `import.meta.env.DEV` → `is_debug` super property. Filter it out in dashboards to exclude dev activity.
- **Super properties:** `app_version`, `app_os` (normalized: `macos` / `windows` / `linux` / `unknown`), `os` (raw legacy `navigator.platform`), `install_id`, `is_debug`.
- **Privacy:** no workspace names, agent names, raw prompts, raw message text, file paths, session keys, or raw error text in PostHog event props. Email is allowed only as a person property after auth, never as an event property.

### Event surface
- **Growth:** `app_active` (once per install per UTC day), `install_created`
- **Activation:** `workspace_created`, `provider_configured`, `agent_created`, `chat_message_sent`, `chat_message_received`
- **Onboarding funnel (acquisition→activation):** one action-first event per first-run step, all carrying `app_os` so a single funnel splits Mac vs Windows. In wizard order: `install_created`, `onboarding_language_selected {locale}`, `onboarding_agreement_accepted`, `user_signed_in {provider}`, `onboarding_started {source}`, `onboarding_step_viewed {step}` (one per onboarding screen reached, ref-guarded so Back/re-render don't refire), `ai_provider_connected {provider}`, `integration_connected {integration_slug}`, `first_message_sent`, `first_email_sent {provider}` (= the conversion — agent sent the first real email, fires strictly before `onboarding_completed`), then the terminal `onboarding_completed` (normal finish) or `onboarding_skipped {step, provider, model}` (the stuck-escape and email-skip paths). **The old `onboarding_welcome_continued` (welcome screen) and `onboarding_assistant_named` (naming step) events were removed with those steps** — Houston now ships one default assistant with no welcome or naming screen, created **silently** the instant the AI connects (that silent create fires the Activation `workspace_created`; see `knowledge-base/agent-manifest.md`). `install_created` must precede every onboarding step — it fires from `<StartupEffects>` at the top of the tree (above the language/disclaimer gates), NOT from App's mount effect, because the gates block `<App/>` from mounting on a fresh install; emitting it late breaks the sequential funnel at step 2. The **login step reuses the shared `user_signed_in` Auth event** (sign-in lives inside onboarding since #447), not a dedicated `onboarding_*` one: it already fires on every sign-in path — email 6-digit code (`provider: "email"`), Google/Gmail and Microsoft via the desktop loopback OAuth or the deep-link fallback (`provider: "google"` / `"azure"`, routed through the same `auth://deep-link` event) — so a second event would be redundant. Unlike the other steps it is NOT ref-guarded once-per-install (it also fires on later re-logins), but the sequential funnel keys on the first occurrence per person, so the step stays clean. The connection/email events fire on the actual action (status poll / completion token), ref-guarded to fire exactly once per install. `integration_connected {integration_slug}` (filtered to `gmail`/`outlook`) is the Gmail/Outlook-connected step.
- **Engagement:** `mission_created`
- **Reliability:** `session_failed`, `app_error_shown`, PostHog `$exception` from JS global handlers + React error boundary

**Activation milestone:** `chat_message_sent` — the user sends their first message (activation = the user acts, not the agent's reply). The app flips the `is_activated` person property on this event; configure `chat_message_sent` as the activation event in PostHog so the server-side insights match the person property, and key all retention/funnel insights off it. **Changed from `chat_message_received` in PR #562** — `is_activated` values set before that ship date reflect the old reply-based definition, so treat the cutover as a discontinuity in any longitudinal activation comparison.

### Web ↔ app journey (one PostHog project)
The marketing site (`website/`, Eleventy) shares the **same** `POSTHOG_KEY`, so the whole acquisition→activation journey is one project.
- **Web funnel:** `$pageview` (landing, `capture_pageview: true` in `base.njk`) → `app_download_clicked { os }` (fired from the OS-neutral Download buttons in `website/src/index.html` — every button shows the Houston logo + "Download"; `detectOs()` only picks which modal opens and stamps `os` — alongside the granular `download_clicked` / `windows_modal_opened` / `*_download_started` events). Break down by `os`. The per-OS button sources `hero-windows` / `pricing-windows` stopped firing in July 2026 when the Mac/Windows button pairs were collapsed into single buttons.
- **App funnel:** `install_created → … → first_email_sent` (break down by `app_os`).
- **download→install hop:** there is no per-binary token, so the aggregate ratio of `app_download_clicked` (web) vs `install_created` (app) over the same window, split by os, IS the "did the download become an install" metric.
- **Identity bridge (per-person stitch):** on first launch `App.tsx` opens `gethouston.ai/welcome?install_id=<id>` in the browser; `website/src/welcome/index.html` calls `posthog.alias(installId)` + `identify(installId)`, merging the anonymous web person (with `$initial_utm_*`, kept alive by `person_profiles: 'always'`) INTO the install identity. This is the canonical bridge — it covers every install regardless of how the app is launched. (A `houston://welcome?ref=` deep-link bridge was considered and rejected: lower coverage and a competing merge path.)

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

## Auth (GCP Identity Platform / Firebase Auth)

Client auth is GCP Identity Platform (Firebase Auth), project `gethouston`. Three sign-in methods (Google, Microsoft, email OTP) plus admin email/password; the gateway bearer is a Firebase ID token (JWT) — issuer `https://securetoken.google.com/gethouston`, aud `gethouston`, `sub` = Firebase uid. How we got here: `knowledge-base/auth-migration.md`.

- **Session storage:** CI releases use macOS Keychain / Windows Credential Manager via the `keyring` crate (`app/src-tauri/src/auth.rs`). Local builds use browser storage scoped per worktree to avoid macOS Keychain prompts from changing local signatures. Override with `HOUSTON_AUTH_STORAGE=keychain` or `HOUSTON_AUTH_STORAGE=browser`.
- **Flow:** Desktop uses a system-browser loopback callback (`127.0.0.1:8975-8978/auth/callback`) + PKCE → Google/Microsoft `id_token` → GCIP REST `signInWithIdp`; session persisted to Keychain with a proactive refresh timer (the old `houston://auth-callback` deep-link path is retired). Web/admin use the firebase-js-sdk popup. Email OTP: the gateway mails a 6-digit code, returns a GCIP custom token, and the client calls `signInWithCustomToken`. Full diagram + code pointers: `knowledge-base/auth.md`. Client auth lives in `app/src/lib/identity/` + `app/src/lib/auth.ts` (the old `supabase.ts` was deleted).
- **Gating:** `isIdentityConfigured()` checks whether `FIREBASE_API_KEY` + `FIREBASE_PROJECT_ID` are baked in. Unconfigured builds skip the sign-in screen entirely.
- **PostHog identity:** On sign-in, `analytics.identifyUser(userId, { email, signupDate })` keeps `install_id` as the `distinct_id`, `alias()`es the Firebase uid onto the person (merging the human across devices/reinstalls), stamps `firebase_uid` + `email` (`$set`) and `signup_date` (`$set_once`) as person properties, then flips the `auth_status` super property to `authenticated`; on sign-out, `analytics.reset()` returns to anonymous (a fresh distinct_id, which also prevents a shared device from merging two people).

## Crash reporting (`sentry` + `tauri-plugin-sentry`)

- **Org / Project:** Sentry org `houston-cd` → Team `houston-eng` → Project `houston-app` (platform `javascript-react` — ONE project for THREE runtimes: the renderer (JS), the Tauri app process (Rust), and the `houston-engine` subprocess (Rust). Events carry a `runtime` tag — `engine` from the engine, `engine-supervisor` from a supervised crash — to tell them apart). Console: https://houston-cd.sentry.io.
- **Dev suppression (`SENTRY_SEND_IN_DEV`, HOU-469):** dev builds DON'T send to Sentry by default — a HARD gate (no client initialized), not just the soft `environment: development` tag. Reason: official builds bake the prod `SENTRY_DSN`, so a developer running `pnpm tauri dev` with that DSN exported (or in `app/.env.local`) would otherwise fire dev errors — including the `Ctrl+Alt+Shift+J/N` smoke triggers — into the prod `houston-app` project (quota, "new issue" Slack alert, issue-list clutter, release-health). The opt-in `SENTRY_SEND_IN_DEV` (truthy: `1`/`true`/`yes`/`on`) re-enables dev sending — exactly the switch for actively testing crash reporting locally. The decision is one rule across all three layers: `dsn_present && (release_build || send_in_dev)` — `sentry_should_activate` in `app/src-tauri/src/lib.rs`, `sentrySuppressedInDev` in `app/src/lib/sentry.ts` (computed from the `__SENTRY_SEND_IN_DEV__` Vite define), and `sentry_suppressed_in_dev` in the engine's `main.rs::init_sentry`. When the app suppresses, it injects NO DSN to the engine (so the engine no-ops too); when it opts in, it also injects `SENTRY_SEND_IN_DEV` so the debug engine sidecar agrees. The engine-env vars are built by the pure `engine_sentry_env` (unit-tested) and the supervisor (`engine_supervisor.rs`) `env_remove`s any inherited `SENTRY_*` before applying them, so the engine's config comes ONLY from the app's gated decision — a shell-exported DSN can't make the sidecar self-report behind the app's back. To keep the app's compile-time `option_env!` gate from going stale relative to the renderer's Vite define, `build.rs` (`configure_sentry_env`) emits `cargo:rerun-if-env-changed` for `SENTRY_DSN` + `SENTRY_SEND_IN_DEV`, so a shell-only toggle recompiles + re-bakes and both layers always agree for the same `pnpm tauri dev` session. Release builds ignore the flag entirely. The renderer additionally shows a dev-only `info` toast ("You're in dev mode, no issue sent" + the flag hint) where the green "report sent" toast would go, so a developer knows the error stayed local. That dev toast is intentionally English-only (not i18n'd) — it's for us, never a real es/pt user.
- **Backend (app process):** Initialized in `lib.rs` BEFORE other plugins. Conditional on `sentry_should_activate` (DSN present, and in dev only with `SENTRY_SEND_IN_DEV` — see Dev suppression above). Explicitly sets `environment` to `production` for release builds and `development` for `pnpm tauri dev`. `release` is `houston-app@<CARGO_PKG_VERSION>` (built explicitly so the SAME string can be forwarded to the engine) — same string release.yml uses for sentry-cli uploads, so events resolve against the uploaded sourcemaps/debug-files.
- **Engine (TS host + runtime):** the TS engine self-inits Sentry from env in BOTH its processes — the host (`packages/host/src/local/main.ts`) and every pi runtime it spawns (`packages/runtime/src/main.ts`), which inherit the host's env. The shared module is `@houston/runtime-client/sentry` (`packages/runtime-client/src/sentry/`): a thin client on dependency-free `@sentry/core` + a plain fetch transport, deliberately NOT `@sentry/node` (its OpenTelemetry require-hooks don't survive `bun build --compile`). Activation is the HOU-469 rule in one pure function (`activation.ts`, unit-tested): `SENTRY_DSN present && (production context || SENTRY_SEND_IN_DEV)`, where production context = the compiled sidecar (`HOUSTON_SIDECAR_BINARY`), a managed pod (`HOUSTON_MANAGED_CLOUD=1`), or `NODE_ENV=production` (self-host image); a source run (tsx/vitest/`pnpm dev`) with a shell-exported DSN stays suppressed without the opt-in. The host announces the decision at boot ("crash reporting: on/off (+why)"). Event identity: tags `runtime=engine` (the established convention the daily-ritual queries key on), `engine_process=host|runtime`, `deployment=managed-cloud|desktop|selfhost|dev`, plus `org_slug`/`agent_slug` on managed pods (from the gateway's pod env — this is what makes "whose agent hit this?" answerable from the issue alone); `server_name` = the pod name on GKE. Error feed mirrors the Rust `sentry-tracing` wiring: the host wraps console (`installConsoleCapture`), the runtime feeds its logger's `capture` hook (`observability/logging.ts`) — ERROR → event (a real `Error` value in the args becomes an exception with stack, a bare string a message event), every level → breadcrumb (last 100 ride each event). Crash semantics preserved: the host stays up on uncaught errors (they're captured via the console wrap); the runtime still exits non-zero on uncaughtException/unhandledRejection but captures + flushes first; the host's fatal boot paths flush before `process.exit(1)`. Dormant by default: empty DSN = no client at all; self-hosters opt in via `SENTRY_DSN` in `selfhost/docker-compose.yml`, none is baked into open-source builds.
- **Engine pods (managed cloud):** `engine-pod-image.yml` bakes `SENTRY_DSN` (repo secret — same DSN the public desktop binaries embed, not a cluster credential) and `SENTRY_RELEASE=engine-pod@<git-sha>` into the `engine-pod` Docker target as build args, plus `SENTRY_ENVIRONMENT=production`. Fork/local image builds pass no args → dormant. The `selfhost` target gets NO DSN. No private-repo (gateway) change involved; rotating the DSN = rotate the secret + rebuild the image.
- **Engine stack traces (no upload pipeline):** engine frames arrive READABLE at capture time instead of being symbolicated server-side — there are no engine debug-file/sourcemap uploads. The desktop sidecar compiles with `bun build --compile --sourcemap` (map embedded in the binary, stacks point at the original `.ts` files); the pod/self-host bundles emit esbuild sourcemaps and run `node --enable-source-maps` (set per-command in the Dockerfile, NOT via `NODE_OPTIONS`, so it never leaks into node processes the agent's bash runs).
- **Engine crash supervisor:** `engine_supervisor.rs` captures a Sentry event (`runtime=engine-supervisor`, `source=engine_crash`, fingerprinted so a crash-loop is one issue) when the engine subprocess exits abnormally (non-zero / signal) while NOT shutting down — the one signal that survives an engine too-dead to self-report. Graceful stdin-EOF shutdown (exit 0) and deliberate teardown (the `RunEvent::Exit` handler sets a shutdown flag) are filtered out.
- **Frontend:** `@sentry/browser`, init in `app/src/lib/sentry.ts`, called from `main.tsx` before anything else mounts. Renderer events go STRAIGHT to Sentry over HTTP (`makeFetchTransport`), NOT through the `tauri-plugin-sentry` IPC bridge. **Why (learned the hard way in 0.4.18):** the IPC path silently dropped `@sentry/browser` 10.x error envelopes in packaged builds — the plugin's Rust `sentry-types` (0.42) parser rejected the newer envelope and discarded it with NO logging, so JS errors never reached Sentry while `flush()` falsely reported success. Native + replay were unaffected because they don't use that path (native = the `sentry` crate panic handler; replay already went direct HTTP), which is exactly how we isolated it: under release `houston-app@0.4.18`, Sentry had the native panic + the engine-supervisor crash but ZERO JS errors, while 70+ replays (direct HTTP) landed fine. Direct HTTP is proven to work from the Tauri webview (`csp: null`). The `tauri-plugin-sentry-api` npm package is no longer used on the JS side (dep still in `package.json`; removable in a follow-up with a lockfile update). The Rust `tauri-plugin-sentry` crate stays registered (harmless) — native crash reporting comes from `sentry::init`'s panic handler, not the plugin. The transport is wrapped (`sentry.ts`) to record each send's real HTTP status per event id; `captureException()` returns an event id (→ the green toast) ONLY after the fetch flush completes AND Sentry returns a 2xx. The SDK's `GlobalHandlers` integration is stripped so uncaught errors are captured + toasted exactly once, by `main.tsx`'s explicit handlers (which need the id for the toast).
- **Session Replay:** `Sentry.replayIntegration()` in `app/src/lib/sentry.ts`, using the SAME direct HTTP transport as every other renderer event. (Historical note: replay used to need a dedicated split transport because everything else went through the Rust IPC bridge, which couldn't carry `replay_event` / `replay_recording` envelopes; now that ALL renderer traffic is direct HTTP, the split + the `isReplayEnvelope` predicate were removed.) **Privacy:** `maskAllText` / `maskAllInputs` / `blockAllMedia` are all on, so recordings capture layout + interaction shape, never chat text, prompts, agent/workspace names or file paths; `sendDefaultPii` stays `false`. **Sampling:** `replaysSessionSampleRate` 0.1, `replaysOnErrorSampleRate` 1.0 (bump session to 1.0 while QA-ing replay). Replay only runs in DSN-baked builds (CI release); dev/forks never record. No CSP change needed — `tauri.conf.json` has `csp: null`.
- **Breadcrumbs:** `sentry-tracing` layer wired into `app/src-tauri/src/logging.rs` (app process); the TS engine's equivalent is the console/logger capture described in "Engine (TS host + runtime)" above. Every log line becomes a breadcrumb on that process's subsequent Sentry events (ERROR also fires a standalone event). Last ~100 log records auto-ride with each crash. **Privacy posture (deliberate, beta):** breadcrumbs AND event messages are intentionally NOT scrubbed — they can leak binary paths and agent names. We accept this tradeoff for crash-debug value during beta (the visible Session Replay IS masked; this is about the crash payload, not the recording). Revisit by adding a `sentry_tracing::layer().event_mapper(...)` + a `before_send` scrubber on both the JS and Rust clients together — do NOT ship a partial scrubber that cleans the title but leaves breadcrumbs. **Volume note:** every `tracing::error!` becomes a standalone Sentry event. Most engine error sites are one-shot, but a persistently-failing scheduled routine (`engine/houston-engine-core/src/routines/scheduler.rs`) can emit one event per cron fire. Sentry's server-side grouping collapses identical messages, so this is acceptable for beta; if a noisy routine becomes a problem, downgrade those specific `tracing::error!` sites to a fingerprinted `sentry::with_scope` capture (like the supervisor's `engine-subprocess-exit`) or a custom `event_filter`.
- **Auto-report flow:** `app/src/lib/error-toast.ts` shows a red "Houston, we have a problem" toast immediately, captures the real `Error` (the original stack — `tauri.ts::surfaceError` forwards it so engine errors group correctly instead of collapsing into one issue), waits for delivery confirmation, then shows a green "Houston, report sent" toast with the event ID prefix + a "Copy code" action that copies the FULL 32-char id (so it can be quoted to support / looked up in Sentry). The id is surfaced ONLY on a confirmed 2xx from Sentry over the direct fetch transport (the wrapper in `sentry.ts` records per-event HTTP status; `captureException` gates on flush AND accept) — so the toast cannot show an id Sentry didn't accept. (Before the direct-HTTP switch the IPC transport returned 200 unconditionally, which is why the toast could lie — see the Frontend bullet.) Capture is decoupled from the toast: `{ toast: false }` engine calls still report to Sentry unless they also pass `{ capture: false }` (fire-and-forget / self-reporting paths); `AbortError`s are filtered (cancelled requests aren't failures). User never has to click "Report bug" when Sentry is reachable.
- **"Send feedback" (the catch-net):** Always-available menu item in the sidebar user-menu dropdown. Opens `feedback-dialog.tsx` with a textarea. Submits to the same Tauri `report_bug` command Linear-ticket flow, with the user's typed message in `BugReportPayload.user_message` so `format.rs` leads the issue title + description with it ("Houston feedback: ..." instead of "Houston bug: ..."). For things Sentry can't see — UX confusion, feature requests, soft errors.
- **Rust panics:** Captured via the sentry panic handler (app process AND engine process). Symbolication is platform-split:
  - **Windows** resolves to file:line directly: `[profile.release] debug = "line-tables-only"` (workspace `Cargo.toml`) keeps line tables in the PDB, which CI uploads.
  - **macOS** needs MORE than `line-tables-only`: that flag leaves DWARF in the per-object `.o` files, NOT in the linked Mach-O, so uploading the executable alone yields function names but NO file:line. CI therefore runs `dsymutil` per binary (app + both engine triples) right after the build to pack a `.dSYM`, and uploads the `.dSYM` alongside the executable. Verify with `sentry-cli debug-files check <binary>.dSYM` (CI logs this; non-fatal warning if it lacks debug info — note the subcommand is `debug-files check`, NOT the old `difutil check` removed in sentry-cli 3.x). Do NOT rely on `line-tables-only` alone on macOS.
  - **Source CODE context (both platforms):** symbolication gives function + file:line, but Sentry shows the actual source LINES inline only if a source bundle is uploaded too. CI passes `--include-sources` to `debug-files upload`, which bundles the referenced source (Houston's own Rust + cargo-registry crates present in the build checkout; NOT the Rust stdlib unless `rust-src` is installed) into Sentry. The repo is open source so there's no exposure concern, and it brings native to parity with JS (whose maps already inline `sourcesContent`). Without the flag you still get file:line, just no code snippet.
- **JS source maps:** Vite emits `*.js.map` next to bundled JS via `build.sourcemap: "hidden"` (no `//# sourceMappingURL=` comment — production users can't view source via DevTools). With a hidden map, Sentry can only link `.js`→`.map` via a **Debug ID baked into the shipped bundle**, so the ID must be injected BEFORE Tauri embeds the frontend.
- **Build-time Debug ID injection:** `app/src-tauri/tauri.conf.json` → `beforeBuildCommand: "pnpm build && node scripts/sentry-inject.mjs"`. The script (`app/scripts/sentry-inject.mjs`, using the `@sentry/cli` devDep) runs `sentry-cli sourcemaps inject app/dist` after the Vite build but before cargo embeds the assets, so the shipped bundle and the uploaded map share identical byte offsets + Debug ID. No-op unless `SENTRY_DSN` is baked in (dev/forks skip it). **Why here, not in CI:** injecting after Tauri packaged `app/dist` (the pre-2026-06 behavior) shifted offsets and every in-app JS frame failed to symbolicate (`js_invalid_sourcemap_location`) even though the map uploaded fine. `beforeBundleCommand` is too late — assets embed during cargo build. Do NOT add `@sentry/vite-plugin` (getsentry #916 risk); the CLI inject achieves the same result. `@sentry/cli` needs an `onlyBuiltDependencies` allowlist in `pnpm-workspace.yaml` (pnpm 10 blocks its postinstall otherwise — without it the native `sentry-cli` binary never downloads and the inject fails). This setting lives in `pnpm-workspace.yaml`, NOT the `package.json` `pnpm` field: recent pnpm stopped reading that field ("The pnpm field in package.json is no longer read").
- **Release.yml uploads:** After Tauri build (which has already injected the bundle), the macOS job runs `sentry-cli releases new + set-commits + sourcemaps upload + debug-files upload` against the signed Tauri app executable + its `.dSYM`. Only the Tauri app SHELL is native now — the engine is the bun-compiled host sidecar (a self-contained binary with no Rust debug info), so there are no engine `.dSYM`/`.pdb` uploads. Each Windows matrix arch uploads its own `app/dist` maps (Vite content-hashes differ per arch) + `houston-app.exe` + `houston_app.pdb` (PDB filename has underscore — Rust convention); the Linux job uploads its own maps + the `houston-app` ELF. `releases finalize` runs ONCE in the dedicated `finalize` job (after both build jobs upload), not per-build. The CI steps **upload only** (no `inject` — that happens at build time). sentry-cli is the lockfile-pinned `app/node_modules/.bin/sentry-cli` (via the `@sentry/cli` devDep), not an unpinned `get-cli` download.
  - **⚠️ The gate that must never regress:** the upload steps gate on `if: ${{ env.SENTRY_AUTH_TOKEN != '' }}`, and `SENTRY_AUTH_TOKEN` is defined at **job level** on `build-macos` / `build-windows` (and `finalize`). It MUST stay job-level: a step's own `env:` block is NOT visible to that same step's `if:` (GitHub evaluates `if:` before step env), so defining it only in the step made the gate read empty and **silently skipped every upload on every run, official builds included** — the bug that left production stack traces minified/hex despite the maps existing. Same footgun fixed on the PostHog annotation step. Forks without the secret still resolve to `''` and skip.
  - **Version guard:** the `prep` job fails the release if the git tag ≠ `app/package.json` version ≠ `app/src-tauri/Cargo.toml` version (all three feed the one `houston-app@<version>` release identity).
- **Sentry smoke shortcuts (DEV-ONLY):** `Ctrl+Alt+Shift+J` throws a JS error from `app/src/lib/error-toast.ts` (source-map frame resolution check); `Ctrl+Alt+Shift+N` invokes a native Tauri command that panics with `sentry-native-stack-smoke-test` (app binary/PDB symbolication check); in DevTools the same hooks are `window.__HOUSTON_SENTRY_SMOKE__.javascript()` / `.native()`. Because dev builds now suppress Sentry by default (Dev suppression above), these only actually transmit when `SENTRY_SEND_IN_DEV` is set — run `pnpm tauri dev` with both that flag and a `SENTRY_DSN` to verify delivery; without the flag BOTH triggers show the dev "no issue sent" toast and nothing leaves the machine (the native trigger checks `sentrySuppressedInDev` too, so it never tells you to "Check Sentry" when the client was never initialized). **These are compiled OUT of release builds** — the JS triggers are gated behind `import.meta.env.DEV` in `main.tsx` (tree-shaken in prod) and the native command's panic path behind `#[cfg(debug_assertions)]` in `commands/diagnostics.rs` (no-op in release). Reason: Houston is open source and official release binaries bake the prod `SENTRY_DSN`, so shipping reachable error-injectors would let anyone flood the prod Sentry project. **To verify symbolication on a SIGNED build** (rare — only when the build/upload setup changes), temporarily drop the `import.meta.env.DEV` guard + the `debug_assertions` cfg and cut a one-off tagged build (the disposable-version + `gh release delete --cleanup-tag` flow). Note: the native smoke panics the **app** process — there is no dedicated engine-process smoke trigger; verify engine (`runtime=engine`) symbolication against a real engine crash.
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

These are **release/CI** vars (baked at build time). Day-to-day development
uses the two-file model instead — committed `.env.development` + secrets-only
`.env.local`, validated by the doctor — see `dev-loop.md`.

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
| `FIREBASE_API_KEY` | GCIP / Firebase Web API key (public, baked at build) | GCP console → Identity Platform / Firebase → project `gethouston` → Web app config |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain (public, baked at build) | Same Web app config (`gethouston.firebaseapp.com`) |
| `FIREBASE_PROJECT_ID` | Firebase project id — `gethouston` (public, baked at build) | Same Web app config |
| `GOOGLE_DESKTOP_CLIENT_ID` | Desktop loopback Google OAuth client id | GCP console → APIs & Services → Credentials → OAuth client (Desktop) |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | Desktop loopback Google OAuth client secret | Same OAuth client (desktop clients are not confidential; safe to bake) |
| `MICROSOFT_DESKTOP_CLIENT_ID` | Desktop loopback Microsoft OAuth client id | Azure portal → App registrations → the desktop app |
| `LINEAR_API_KEY` | Create in-app bug-report issues | Linear → Settings → Account → Security & Access → Personal API keys |
| `LINEAR_TEAM_ID` | Target team for in-app bug-report issues | Linear command menu → Copy model UUID on the target team |
| `SENTRY_DSN` | Crash reporting DSN baked into the app at build time | Sentry → houston-cd → houston-app → Settings → Client Keys (DSN) |
| `SENTRY_SEND_IN_DEV` | Opt-in (truthy) to send Sentry events from a dev build; unset → dev builds suppress Sentry so dev errors don't pollute the prod project (HOU-469). Ignored by release builds. | Set locally only when testing crash reporting in `pnpm tauri dev` |
| `SENTRY_AUTH_TOKEN` | sentry-cli auth for source map + debug symbol upload in release.yml. Scopes: `project:releases`, `project:read`, `org:read`. Skip the upload step entirely when unset (forks, personal builds). | Sentry → Settings → Auth Tokens |
| `HOSTED_ENGINE_URL` | Managed-gateway base URL, baked on the `cloud-v*` channel TWICE: as `VITE_HOSTED_ENGINE_URL` (the app talks to Houston Cloud) and as `HOUSTON_INTEGRATIONS_URL` (compile-time `option_env!` in `app/src-tauri/src/lib.rs`, handed to the spawned LOCAL engine sidecar so connected apps + the onboarding email step work on the local engine too — the gateway serves `/v1/integrations/*` on the same base). Empty on plain `v*` tags → local-engine integrations off there (no gateway to authenticate against). | Cloud deployment |

CI also needs as Secrets:
- `APPLE_CERTIFICATE` — base64 `.p12`
- `APPLE_CERTIFICATE_PASSWORD` — password for `.p12`

**Never hardcode.** Read via `option_env!()` in Rust (compile-time). Pass as env vars in CI.

## CI/CD (GitHub Actions)

- **Workflow:** `.github/workflows/release.yml`
- **Trigger:** Push tag matching `v*`
- **Engine:** builds the desktop app around the **bun-compiled Houston host sidecar** (the TS engine). The Rust `engine/` was removed, so this is the only path — a plain `pnpm tauri build` builds the host too (no cargo feature to opt in). No provider CLIs are bundled (pi runs providers in-process).
- **Sidecar staleness guard (release-only):** `scripts/build-host-sidecar.sh` stamps each compiled sidecar with the git HEAD it built at (`<binary>.stamp`) and its `--verify` step asserts `/v1/catalog` returns a non-empty array. On a RELEASE build `build.rs` panics if any of the sidecar's input paths changed since that stamp commit (committed, staged, unstaged, or untracked), so a stale binary left from a previous commit can never ship. This is the guard against the v0.5.2 incident (a host predating the `/v1/catalog` route bundled silently, leaving the app with providers but zero models). Debug builds skip the check. Detail: houston `CLAUDE.md` "Host sidecar staleness".
- **Linux AppImage Bun repair:** linuxdeploy runs `patchelf` on every dynamic ELF and adds `$ORIGIN/../lib` as a RUNPATH. A Bun standalone executable carries its bundled JavaScript as an appended ELF payload; that mutation made the packaged `houston-engine` segfault before `HOUSTON_HOST_LISTENING` even though the pre-bundle verification passed (v0.5.6 on Arch/Omarchy). After Tauri creates the AppImage, `scripts/ci/repair-linux-appimage-sidecar.sh` extracts it, restores the byte-identical sidecar from `target/host-sidecar`, rebuilds the SquashFS behind the original AppImage runtime, and reads the final payload back to verify it. This repair must stay before checksum generation and upload.
  - **⚠️ The guard's input set includes root `package.json` + `pnpm-lock.yaml`, so any CI step that mutates a manifest BEFORE `tauri build` must restore it or the release panics with "STALE: … uncommitted … edits to sidecar input files".** The macOS job's "Force-install both macOS Claude SDK platform packages" step runs `pnpm add -w …@ver --force` to land BOTH per-arch `@anthropic-ai/claude-agent-sdk-darwin-{arm64,x64}` in the pnpm store (the universal lipo needs both slices, but `pnpm install` resolves only the runner-native one). That `pnpm add` rewrites both manifests, dirtying the tree. The fix: `git checkout HEAD -- package.json pnpm-lock.yaml` immediately after — `build-host-sidecar.sh` `cp`s the `claude` binary straight out of `node_modules/.pnpm/…` (never re-installs, never reads the manifest), so restoring the tracked files leaves the store packages in place while giving the guard the clean tree it requires. Regression origin: the Force-install step (PR #675, 2026-07-06) predated the guard adding the manifests to `SIDECAR_INPUT_PATHS` (PR #729, 2026-07-07); #729 turned the benign mutation into a hard macOS-release failure. The restore first shipped on the `cloud-v0.5.5` branch and was ported to `main` here.
- **Whisper dictation sidecar (`scripts/build-whisper.sh`):** each release runner builds `whisper-cli` for its own arch natively (no cross toolchain on Linux/Windows); a same-OS arch mismatch is rejected. **⚠️ Windows-on-ARM host detection:** the `windows-11-arm` runner's Git Bash is an x86_64 MSYS binary running under Windows' x64 emulator, so `uname -m` reports `x86_64` even though the CPU is ARM64 — which used to false-trip the native-arch guard ("cannot build aarch64-pc-windows-msvc on a x86_64 host") and fail EVERY arm64 Windows release. `host_arch()` now resolves the true arch from emulation-immune signals in order: `RUNNER_ARCH` (GitHub-set, authoritative in CI) → `PROCESSOR_ARCHITEW6432` (Windows sets it to the native arch inside an emulated process) → `PROCESSOR_ARCHITECTURE` → `uname -m`. (rustc/bun in the same job always detected arm64 correctly — only the MSYS `uname` was wrong.)
- **Output:** Draft GitHub Release w/ signed+notarized universal DMG + signed Windows MSI (x64 + arm64) + Linux AppImage + `latest.json`
- **Duration:** ~25-30 min wall-clock (mac + win + linux run in parallel; mac is the long pole at ~25 min including Apple notarization).
- **Draft = QA gate.** Users don't see until published on GitHub.

### Job graph
```
prep (ubuntu, ~30s)               creates empty draft + release-notes.md artifact
  ├── build-macos (mac, ~25m)     bun-compiles host sidecar (both arches) → signs, notarizes, uploads DMG/tar/sig/latest.json
  ├── build-windows (win, ~15m)   bun-compiles host sidecar per arch → uploads MSI + .sig (x64 + arm64)
  ├── build-linux (ubuntu, ~15m)  bun-compiles host sidecar → uploads AppImage (download-only, not in latest.json)
  ├── build-web (ubuntu, ~5m)     builds packages/web → uploads web-dist.tar.gz + Sentry maps, deploys PREVIEW site
  └── finalize (ubuntu, ~30s) [needs mac + win] extends latest.json with windows entries, posts Slack
```
Mac, Windows, Linux, and web run in parallel because they only need the empty draft `prep` creates, not each other's output. `finalize` stitches `latest.json` together (the macOS-only base from build-macos plus the Windows entries assembled from the MSI .sig in the draft) and posts the team Slack notification — it needs only mac + win, so a flaky new Linux/web leg never blocks the updater manifest or the mac/win artifacts already on the draft. Linux is UNSIGNED + download-only (no auto-update entry). Slack lives in `finalize` (not Windows) because it needs `release-notes.md` and the file is published as a workflow artifact by `prep`.

## Web client hosting (Firebase Hosting)

The browser web client (`packages/web`) is served from **Firebase Hosting** in GCP project `gethouston`, on two sites:

| Site ID | Domain | Role |
| --- | --- | --- |
| `houston-web` | app.gethouston.ai | production |
| `houston-web-preview` | preview.gethouston.ai (+ `*.web.app`) | preview / QA gate |

**One build, promoted byte-for-byte.** There are **NO environment-specific VITE flags**. `build-web` (in `release.yml`, gated to `v*` tags on `gethouston/houston`) builds `packages/web` ONCE, and the environment is derived at **runtime** from `window.location.hostname` (`packages/web/src/deploy-environment.ts`): app.gethouston.ai → `production`, preview.gethouston.ai / `*.web.app` → `preview`, localhost → `development`. `main.tsx` publishes the result on `window.__HOUSTON_DEPLOY_ENV__` before the app graph loads; the shared `sentry.ts` + `analytics.ts` read it to tag their `environment`, and the web-only `PreviewBadge` (`packages/web/src/preview-badge.tsx`) renders a small "Preview" pill only on preview.

**Flow:**
1. `build-web` builds with the gateway URL (`VITE_CONTROL_PLANE_URL` ← the `HOSTED_ENGINE_URL` secret, i.e. `https://gateway.gethouston.ai` — host/cloud-login mode: the app's own GCP Identity Platform (Firebase Auth) gates sign-in, all domain calls hit the gateway), the `FIREBASE_API_KEY`/`FIREBASE_AUTH_DOMAIN`/`FIREBASE_PROJECT_ID` trio that configures that GCIP sign-in (the web bundle authenticates with firebase-js-sdk's popup, so `FIREBASE_API_KEY` is load-bearing and has no build-time default; the desktop-only `GOOGLE_DESKTOP_*`/`MICROSOFT_DESKTOP_CLIENT_ID` loopback vars are deliberately NOT baked — that flow never runs in a browser tab), and `POSTHOG_*`/`SENTRY_DSN`. It injects Sentry Debug IDs, uploads sourcemaps under the web release **`houston-app@<version>-web`** (the `-web` suffix keeps web crashes on their own Sentry release; the runner stamps the real version onto `packages/web/package.json`, which ships a `0.0.0` placeholder), strips the `.map` files, tars `dist` **deterministically** into `web-dist.tar.gz`, attaches it to the draft release, and deploys those bytes to the **preview** site.
2. `web-promote.yml` (trigger: `release: published`, guarded to `v*` + not-prerelease + canonical repo) downloads the SAME `web-dist.tar.gz` from the published release, checks out `firebase.json`/`.firebaserc` at the release tag, unpacks, and deploys the identical bytes to the **production** site. No rebuild. A published release with **no** web asset (tag predates this pipeline) is **skipped with a notice**, never red-X'd; a present-but-empty asset fails loudly. `concurrency: web-promote` serializes overlapping publishes.

**Auth:** keyless **Workload Identity Federation**, same provider as `engine-pod-image.yml` (`…/workloadIdentityPools/github/providers/houston`), service account `github-deploy-web@gethouston.iam.gserviceaccount.com`. `firebase-tools` reads the ADC `google-github-actions/auth` writes — no `FIREBASE_TOKEN`.

**Config** lives in `packages/web/firebase.json` + `.firebaserc` (targets `production`→`houston-web`, `preview`→`houston-web-preview`). SPA rewrite all→`/index.html`; hashed `/assets/**` get `immutable` 1-year cache, everything else `no-cache`; security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`) on both; the **preview** target additionally serves `X-Robots-Tag: noindex`. Header differences live in per-target config, so the promoted artifact stays byte-identical.

**Rollback:** re-publish an older release (re-runs `web-promote` and re-deploys that release's `web-dist.tar.gz`), or roll back in the Firebase Hosting console (`firebase hosting:clone` / version pinning).

**Required GitHub secrets** are all pre-existing (reused from the desktop jobs): `HOSTED_ENGINE_URL` (must equal the managed gateway URL), `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `POSTHOG_KEY`, `POSTHOG_HOST`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`. No NEW secrets. The one prerequisite is the GCP-side WIF binding for `github-deploy-web@` (Firebase Hosting Admin) — infra, not a repo secret.

## Marketing site hosting (Firebase Hosting; Cloudflare dual-deploy during the DNS flip)

Distinct from the web CLIENT above: this is the **marketing site** (`website/`, Eleventy → gethouston.ai). It is **mid-cutover from Cloudflare Pages to Firebase Hosting** — both receive every deploy until the DNS flip, and the live apex still resolves to Cloudflare.

**Deploy** — `.github/workflows/website-deploy.yml`, on every push to `main` under `website/**` (or manual `workflow_dispatch`):
1. Build the Eleventy site (`npx @11ty/eleventy`, output `_site`). The waitlist `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `WAITLIST_SHEET_ENDPOINT` are injected at build — the **waitlist deliberately stays on Supabase** (`knowledge-base/auth.md`, `auth-migration.md`).
2. Deploy to **Firebase Hosting** site **`gethouston-site`** (project `gethouston`) → https://gethouston-site.web.app. Auth is keyless **Workload Identity Federation** (SA `github-deploy-web@gethouston.iam.gserviceaccount.com`, provider `…/workloadIdentityPools/github/providers/houston`) — the same WIF path the web-client and engine-pod-image workflows use; no `FIREBASE_TOKEN`.
3. **Dual-deploy** to **Cloudflare Pages** (project `houston-site`, `wrangler pages deploy _site`, secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`). This step is **temporary** and is explicitly marked to be **deleted once the DNS flip lands**.

**DNS state (in progress).** The apex / www records for `gethouston.ai` still point at **Cloudflare Pages**; Firebase serves only `gethouston-site.web.app` so far. Human cutover: verify the Firebase deploy on `gethouston-site.web.app` (redirects, headers, URL shape) → add the custom domain in Firebase Hosting → flip apex/www DNS to Firebase → retire the Cloudflare Pages project AND delete the dual-deploy step.

**Config** is `website/firebase.json` + `website/.firebaserc` (project `gethouston`, single site `gethouston-site`, public `_site`, `cleanUrls`). It is the **source of truth** for redirects (`/pricing/` → `/#pricing`) and headers (HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`, `X-Robots-Tag: noindex` on `/early-access|auth|slack`, `max-age=60` HTML/CSS cache). The legacy Cloudflare `website/src/_headers` + `website/src/_redirects` still exist but are **ignored on Firebase** (`firebase.json` `ignore` list); they stay in the repo, harmless, until the Cloudflare retirement.

## macOS Universal (arm64 + Intel)

Houston ships ONE DMG that runs natively on Apple Silicon AND Intel. Same app, same download, same update channel.

### How it works
- `release.yml` bun-compiles the **host sidecar** TWICE — once per real triple (`aarch64-apple-darwin`, `x86_64-apple-darwin`) via `scripts/build-host-sidecar.sh <triple>` — then `lipo`s the two `target/host-sidecar/houston-host-<triple>` outputs into one fat `binaries/houston-engine-universal-apple-darwin` (the universal bundle's externalBin).
- `build.rs::stage_host_sidecar` also stages per-triple copies to `src-tauri/binaries/houston-engine-<triple>` during tauri's per-arch cargo runs; the manually-lipo'd fat binary is what the `--target universal-apple-darwin` bundle actually ships. The externalBin name (`houston-engine-<triple>`) is kept from the old Rust engine so `tauri.conf.json` is unchanged.
- `tauri-action` invoked with `--target universal-apple-darwin`. Bundle lands at `target/universal-apple-darwin/release/bundle/`.
- Verification step runs `lipo -info` on the embedded host sidecar and fails the release if either slice is missing.
- `latest.json` ships FOUR platform keys (`darwin-aarch64`, `darwin-aarch64-app`, `darwin-x86_64`, `darwin-x86_64-app`) all pointing at the same tarball + signature. Intel users on older Houston installs check `darwin-x86_64` — if that key is absent they NEVER see the update prompt.
- `bundle.macOS.minimumSystemVersion = 10.15` in `tauri.conf.json` — required for Intel Macs old enough to matter.

### Standalone host binary release
`.github/workflows/engine-release.yml` (tag `engine-v*`) bun-compiles the **standalone Houston host binary** (`houston-host-<triple>` — the same self-contained binary the desktop embeds as its sidecar, and the one a `selfhost/` operator can run directly instead of the Docker image) for Linux (arm64 + x86_64 gnu) and macOS (arm64 + Intel). Four artifacts total. Replaced the legacy standalone Rust `houston-engine` build; needs no Rust toolchain (bun only).

### Local universal build
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
# bun-compile the host sidecar for both arches, then lipo into the universal externalBin
scripts/build-host-sidecar.sh aarch64-apple-darwin
scripts/build-host-sidecar.sh x86_64-apple-darwin
lipo -create \
  target/host-sidecar/houston-host-aarch64-apple-darwin \
  target/host-sidecar/houston-host-x86_64-apple-darwin \
  -output app/src-tauri/binaries/houston-engine-universal-apple-darwin
cd app && VITE_NEW_ENGINE=1 pnpm tauri build --target universal-apple-darwin --features host-sidecar
```
Output: `target/universal-apple-darwin/release/bundle/{macos,dmg}/`.

### Dev is single-arch
`pnpm tauri dev` stays single-triple (whatever the host is). `build.rs` falls back to `target/release/` when a per-triple path is missing, so nothing breaks.

### Do NOT break Intel without warning
Removing an arch from `release.yml` (or dropping `darwin-x86_64*` keys from `latest.json`) strands every Intel user silently. Migrate with a deprecation release first.
