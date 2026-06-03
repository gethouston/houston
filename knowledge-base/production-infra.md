# Production Infrastructure

Four prod systems. All **dormant by default** — activate only when env vars set.

## Auto-updater (`tauri-plugin-updater`)

- **Config:** `tauri.conf.json` → `plugins.updater` (endpoint + pubkey)
- **Frontend:** `app/src/hooks/use-update-checker.ts` → checks on launch + every 30 min
- **UI:** `app/src/components/shell/update-checker.tsx` → update card w/ download, progress, details, relaunch
- **How:** Checks `latest.json` on GitHub Releases. Newer version? Downloads `.app.tar.gz`, verifies Ed25519 sig, replaces binary, relaunches.
- **Relaunch:** frontend captures the original app bundle path before install and calls `relaunch_app_from_path` after install. Do not use generic process relaunch after macOS updater install; it can resolve to the moved backup bundle and reopen the old version.
- **Notes:** release CI writes `release-notes.md` into `latest.json.notes`; the update card renders those details as markdown via `update-notes.tsx`, which reuses the shared `MessageResponse` (Streamdown) renderer from `@houston-ai/chat` (no extra markdown dep) scoped compact for the small card.
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

## Auth (`@supabase/supabase-js` + Google SSO)

- **Session storage:** CI releases use macOS Keychain / Windows Credential Manager via the `keyring` crate (`app/src-tauri/src/auth.rs`). Local builds use browser storage scoped per worktree to avoid macOS Keychain prompts from changing local signatures. Override with `HOUSTON_AUTH_STORAGE=keychain` or `HOUSTON_AUTH_STORAGE=browser`.
- **Flow:** One-click Google sign-in → system browser → OAuth redirect to `houston://auth-callback` → `tauri-plugin-deep-link` forwards to frontend → Supabase PKCE exchange → session persisted in configured auth storage. Full diagram + code pointers: `knowledge-base/auth.md`.
- **Gating:** `isAuthConfigured()` checks whether `SUPABASE_URL` + `SUPABASE_ANON_KEY` are baked in. Unconfigured builds skip the sign-in screen entirely.
- **PostHog merge:** On sign-in, `analytics.alias(userId, { email })` merges anonymous install_id history to the identified user and sets `email` / `email_domain` person properties; on sign-out, `analytics.reset()` returns to anonymous.

## Crash reporting (`sentry` + `tauri-plugin-sentry`)

- **Org / Project:** Sentry org `houston-cd` → Team `houston-eng` → Project `houston-app` (platform `javascript-react` — one project for both frontend + engine; events tagged with `runtime` to distinguish). Console: https://houston-cd.sentry.io.
- **Backend:** Initialized in `lib.rs` BEFORE other plugins. Conditional on `option_env!("SENTRY_DSN")`. Explicitly sets `environment` to `production` for release builds and `development` for `pnpm tauri dev`. `release` is `houston-app@<CARGO_PKG_VERSION>` via `sentry::release_name!()` — same string release.yml uses for sentry-cli uploads, so events resolve against the uploaded sourcemaps/debug-files.
- **Frontend:** `@sentry/browser` + `tauri-plugin-sentry-api`. Init lives in `app/src/lib/sentry.ts`, called from `main.tsx` before anything else mounts. The `defaultOptions` from `tauri-plugin-sentry-api` route JS events through Tauri IPC into the Rust SDK — single endpoint, no duplicate events. `captureException()` now waits for `Sentry.flush(5000)` before returning an event ID, so the green "Houston, we have a solution" toast appears only after the frontend transport confirms the envelope left its queue. This is a send/flush confirmation, not a Sentry ingestion guarantee.
- **Session Replay:** added via `Sentry.replayIntegration()` in `app/src/lib/sentry.ts`. The catch: replay envelopes (`replay_event` / `replay_recording`) CANNOT survive the IPC hop — the Rust SDK's envelope parser (`sentry-types`) has no variant for those item types and no catch-all, so `Envelope::from_slice` errors and `tauri-plugin-sentry`'s `envelope` command silently drops the whole envelope. The naive "just add replayIntegration" config therefore records ZERO replays. So `initSentry` installs a **split transport**: replay envelopes go straight to Sentry over HTTP (`makeFetchTransport`), every other envelope keeps flowing through the Rust SDK via IPC (`makeRendererTransport`). The routing decision is the pure, unit-tested `isReplayEnvelope` predicate in `app/src/lib/sentry-replay.ts` (`app/tests/sentry-replay.test.ts`). **Privacy:** `maskAllText` / `maskAllInputs` / `blockAllMedia` are all on, so recordings capture layout + interaction shape, never chat text, prompts, agent/workspace names or file paths; `sendDefaultPii` stays `false`. **Sampling:** `replaysSessionSampleRate` 0.1, `replaysOnErrorSampleRate` 1.0 (bump session to 1.0 while QA-ing replay). Replay only runs in DSN-baked builds (CI release); dev/forks never record. No CSP change needed — `tauri.conf.json` has `csp: null`.
- **Breadcrumbs:** `sentry-tracing` layer wired into `logging.rs`'s tracing registry. Every `tracing::info!`/`warn!`/`error!` call from the engine + app becomes a breadcrumb on subsequent Sentry events. Last ~100 log records auto-ride with each crash. Tradeoff documented in code: breadcrumbs leak binary paths and agent names. Acceptable for beta; sanitize via `sentry_tracing::layer().event_mapper(...)` if it becomes a concern.
- **Auto-report flow:** `app/src/lib/error-toast.ts` shows red "Houston, we have a problem" toast immediately, captures the real `Error` when the caller has one, waits for Sentry flush confirmation, then shows a green "Houston, we have a solution" toast with the Sentry event ID (first 8 chars). User never has to click a "Report bug" button when Sentry is reachable — Sentry already has it.
- **"Send feedback" (the catch-net):** Always-available menu item in the sidebar user-menu dropdown. Opens `feedback-dialog.tsx` with a textarea. Submits to the same Tauri `report_bug` command Linear-ticket flow, with the user's typed message in `BugReportPayload.user_message` so `format.rs` leads the issue title + description with it ("Houston feedback: ..." instead of "Houston bug: ..."). For things Sentry can't see — UX confusion, feature requests, soft errors.
- **Rust panics:** Captured via sentry panic handler. Symbolicates to file:line because `[profile.release] debug = "line-tables-only"` in the workspace `Cargo.toml` keeps line tables in release binaries (~10-15% size bump, no full debug info).
- **JS source maps:** Vite emits `*.js.map` next to bundled JS via `build.sourcemap: "hidden"` (no `//# sourceMappingURL=` comment — production users can't view source via DevTools). With a hidden map, Sentry can only link `.js`→`.map` via a **Debug ID baked into the shipped bundle**, so the ID must be injected BEFORE Tauri embeds the frontend.
- **Build-time Debug ID injection:** `app/src-tauri/tauri.conf.json` → `beforeBuildCommand: "pnpm build && node scripts/sentry-inject.mjs"`. The script (`app/scripts/sentry-inject.mjs`, using the `@sentry/cli` devDep) runs `sentry-cli sourcemaps inject app/dist` after the Vite build but before cargo embeds the assets, so the shipped bundle and the uploaded map share identical byte offsets + Debug ID. No-op unless `SENTRY_DSN` is baked in (dev/forks skip it). **Why here, not in CI:** injecting after Tauri packaged `app/dist` (the pre-2026-06 behavior) shifted offsets and every in-app JS frame failed to symbolicate (`js_invalid_sourcemap_location`) even though the map uploaded fine. `beforeBundleCommand` is too late — assets embed during cargo build. Do NOT add `@sentry/vite-plugin` (getsentry #916 risk); the CLI inject achieves the same result. `@sentry/cli` needs a `pnpm.onlyBuiltDependencies` allowlist in the root `package.json` (pnpm 10 blocks its postinstall otherwise).
- **Release.yml uploads:** After Tauri build (which has already injected the bundle), the macOS job runs `sentry-cli releases new + set-commits + sourcemaps upload + debug-files upload + finalize` against the signed Tauri app executable plus `target/{aarch64,x86_64}-apple-darwin/release/houston-engine`. Each Windows matrix arch uploads its own `app/dist` maps (Vite content-hashes differ per arch) + `houston-app.exe` + `houston_app.pdb` + `houston-engine.exe` + `houston_engine.pdb` (PDB filename has underscore — Rust convention). The CI steps **upload only** (no `inject` — that now happens at build time). Skipped silently when `SENTRY_AUTH_TOKEN` is unset (forks, personal builds).
- **Sentry smoke shortcuts:** Installed builds expose hidden diagnostics shortcuts for release QA. `Ctrl+Alt+Shift+J` throws a JS error from `app/src/lib/error-toast.ts` so source-map frame resolution can be checked. `Ctrl+Alt+Shift+N` invokes a native Tauri command that panics with `sentry-native-stack-smoke-test` so app binary/PDB symbolication can be checked. In DevTools the same hooks are available as `window.__HOUSTON_SENTRY_SMOKE__.javascript()` and `window.__HOUSTON_SENTRY_SMOKE__.native()`. These are intentionally not visible in UI.
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
