# Production Infrastructure

Four prod systems. All **dormant by default** — activate only when env vars set.

## Auto-updater (`tauri-plugin-updater`)

- **Config:** `tauri.conf.json` → `plugins.updater` (endpoint + pubkey)
- **Frontend:** `app/src/hooks/use-update-checker.ts` → checks on launch + every 30 min
- **UI:** `app/src/components/shell/update-checker.tsx` → update card w/ download, progress, details, relaunch
- **How:** Checks `latest.json` on GitHub Releases. Newer version? Downloads `.app.tar.gz`, verifies Ed25519 sig, replaces binary, relaunches.
- **Relaunch:** frontend captures the original app bundle path before install and calls `relaunch_app_from_path` after install. Do not use generic process relaunch after macOS updater install; it can resolve to the moved backup bundle and reopen the old version.
- **Notes:** release CI writes `release-notes.md` into `latest.json.notes`; the update card shows those details.
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
- **Super properties:** `app_version`, `os`, `install_id`, `is_debug`.
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

### PostHog dashboards
Create one dashboard: **Houston Growth + Reliability**. Every tile filters `is_debug != true`.

1. **DAU:** unique users, event `app_active`, interval day
2. **WAU:** unique users, event `app_active`, interval week
3. **MAU:** unique users, event `app_active`, interval month
4. **Activation funnel:** `install_created` → `workspace_created` → `provider_configured` → `agent_created` → `chat_message_sent` → `chat_message_received`
5. **Activated retention:** weekly retention where start + return event = `chat_message_received`
6. **Engaged users:** unique users with `mission_created` or `chat_message_received`
7. **Reliability:** count of `session_failed` + `$exception`, broken down by `error_kind`
8. **Company domains:** active users broken down by person property `email_domain`
9. **Active users by app version:** unique users, event `app_active`, breakdown by super property `app_version`, interval last 30 days, sort descending. Surfaces stragglers on old builds so we know how big the "needs to update" cohort is.

Do NOT use raw autocapture event lists for product decisions. If a question needs click-level data, prefer one temporary, named event and delete it after the decision.

### Pulling a contact list of users on stale versions

The dashboard tile shows COUNTS. To actually reach people on old versions, use PostHog **Persons** (not Insights):

1. Persons → "New cohort" (or ad-hoc filter)
2. Filter: `app_version` (super property, type **Event property**) `is not` `<latest version>` (e.g. `0.4.3`). Repeat with `is_set` to exclude any persons missing the property.
3. Optionally also filter `email is_set` — only signed-in users have an email; anonymous installs cannot be emailed.
4. Export the cohort as CSV. Columns of interest: `email`, `email_domain`, `app_version`, `os`.

Caveats:
- `app_version` is a SUPER property attached to events, not a person property. So filtering by it on Persons works only if PostHog has seen that person fire an event recently in that version. Long-dormant users may not show up.
- Anonymous users (never signed in) have no `email`. They are the "can't reach by email" bucket; their count on the dashboard tile vs the exportable cohort = the unreachable delta.
- The `is_debug != true` filter applies to the dashboard tile but not to the Persons export — add it to the cohort definition manually.

### BigQuery export (optional)
PostHog → BigQuery plugin → target GCP project (burns credits). SQL-queryable event history forever, immune to PostHog retention limits. Useful for investor-update analytics.

## Auth (`@supabase/supabase-js` + Google SSO)

- **Session storage:** CI releases use macOS Keychain / Windows Credential Manager via the `keyring` crate (`app/src-tauri/src/auth.rs`). Local builds use browser storage scoped per worktree to avoid macOS Keychain prompts from changing local signatures. Override with `HOUSTON_AUTH_STORAGE=keychain` or `HOUSTON_AUTH_STORAGE=browser`.
- **Flow:** One-click Google sign-in → system browser → OAuth redirect to `houston://auth-callback` → `tauri-plugin-deep-link` forwards to frontend → Supabase PKCE exchange → session persisted in configured auth storage. Full diagram + code pointers: `knowledge-base/auth.md`.
- **Gating:** `isAuthConfigured()` checks whether `SUPABASE_URL` + `SUPABASE_ANON_KEY` are baked in. Unconfigured builds skip the sign-in screen entirely.
- **PostHog merge:** On sign-in, `analytics.alias(userId, { email })` merges anonymous install_id history to the identified user and sets `email` / `email_domain` person properties; on sign-out, `analytics.reset()` returns to anonymous.

## Crash reporting (`sentry` + `tauri-plugin-sentry`)

- **Backend:** Initialized in `lib.rs` BEFORE other plugins. Conditional on `option_env!("SENTRY_DSN")`.
- **Frontend:** Auto-injected by `tauri-plugin-sentry`. Catches JS errors + unhandled promise rejections. Zero frontend code.
- **Rust panics:** Captured via sentry panic handler.
- **Check:** User reports crash or weird behavior → Sentry dashboard BEFORE local logs.

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
| `TAURI_SIGNING_PRIVATE_KEY` | Ed25519 key for update signing | `bun run tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for above | Set during gen |
| `POSTHOG_KEY` | PostHog project API key (client-side, public-safe) | PostHog → Project settings → Project API key |
| `POSTHOG_HOST` | PostHog ingest host | `https://us.i.posthog.com` (or EU equivalent) |
| `SUPABASE_URL` | Supabase project URL | Supabase → Project settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (public-safe, RLS-gated) | Supabase → Project settings → API → Project API keys → `anon` `public` |
| `LINEAR_API_KEY` | Create in-app bug-report issues | Linear → Settings → Account → Security & Access → Personal API keys |
| `LINEAR_TEAM_ID` | Target team for in-app bug-report issues | Linear command menu → Copy model UUID on the target team |
| `SENTRY_DSN` | Crash reporting DSN | sentry.io project settings |

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
cd app && bun run tauri build --target universal-apple-darwin
```
Output: `target/universal-apple-darwin/release/bundle/{macos,dmg}/`.

### Dev is single-arch
`bun run tauri dev` stays single-triple (whatever the host is). `build.rs` falls back to `target/release/` when a per-triple path is missing, so nothing breaks.

### Do NOT break Intel without warning
Removing an arch from `release.yml` (or dropping `darwin-x86_64*` keys from `latest.json`) strands every Intel user silently. Migrate with a deprecation release first.
