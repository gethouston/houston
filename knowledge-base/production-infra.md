# Production infrastructure

Updater, analytics, in-app bug reports, release env vars, code signing, and CI/CD.
All **dormant by default** — activated only when their env vars are set.

Split out: crash reporting → [sentry.md](sentry.md) · Firebase Hosting for the web
client and marketing site → [hosting.md](hosting.md) · auth → [auth.md](auth.md).

## Auto-updater (`tauri-plugin-updater`)

- **Config:** `tauri.conf.json` → `plugins.updater` (endpoint + pubkey).
- **Frontend:** `app/src/hooks/use-update-checker.ts` — checks on launch + every
  30 min. UI: `app/src/components/shell/update-checker.tsx` (update card with
  download, progress, details, relaunch).
- **How:** checks `latest.json` on GitHub Releases; newer version → downloads
  `.app.tar.gz`, verifies the Ed25519 signature, replaces the binary, relaunches.
- **Relaunch:** the frontend captures the ORIGINAL app bundle path before install and
  calls `relaunch_app_from_path` after. Do NOT use generic process relaunch after a
  macOS updater install — it can resolve to the moved backup bundle and reopen the old
  version.
- **Notes rendering:** release CI writes the notes payload into `latest.json.notes`;
  `update-notes.tsx` renders it as markdown through the shared `MessageResponse`
  (Streamdown) renderer from `@houston-ai/chat`, scoped compact for the small card.
- **Localized notes (en/es/pt):** the updater carries exactly ONE notes string, so
  translations ride inside it as a trailing
  `<!--houston-i18n:{"es":...,"pt":...}-->` comment. The `prep` job builds this from
  `.github/release-notes/<version>.md` (English base) plus optional `.es.md` /
  `.pt.md` siblings and ships it as a separate `update-notes` artifact (the GitHub
  release body + Slack stay clean English from `release-notes.md`). The frontend
  `selectUpdateNotes` (`app/src/lib/update-details.ts`) strips the comment, parses the
  JSON, and picks the live UI locale, falling back to English. Degrades cleanly — any
  renderer that ignores HTML comments just shows English. Authoring convention:
  `.github/release-notes/README.md`.
- **⚠️ Update signing (Ed25519 via `TAURI_SIGNING_PRIVATE_KEY`) is SEPARATE from
  Apple code signing.** Both needed.
- **⚠️ Users who install a version WITHOUT the updater can never auto-update.** Ship
  the updater in EVERY release.

## Analytics (`posthog-js`)

- **Purpose:** investor-grade usage + product decisions only. Avoid broad behavioral
  surveillance.
- **Pure JS**, runs in the webview — no Rust plugin, no Tokio runtime conflicts.
- **Init:** `app/src/lib/analytics.ts` reads `POSTHOG_KEY` + `POSTHOG_HOST` via Vite
  `define` (baked at build). Empty key → silent no-op. PostHog `init()` runs at module
  load for JS exception capture; product events fire after `analytics.init()`
  identifies the persistent install_id.
- **PostHog config:** pageview/pageleave, session replay, heatmaps and feature-flag
  `/flags` calls are disabled in code. Autocapture is ON but fully masked
  (`mask_all_text` + `mask_all_element_attributes` — selectors/positions only, no user
  content) because rage-click and dead-click capture require it. Enable anything
  further only with a specific question.
- **Install identity:** `app/src/lib/install-id.ts` mints a UUID on first launch,
  persisted via `tauriPreferences` (`install_id`). It is the PostHog `distinct_id` for
  the whole app lifetime and **stays** the distinct_id after sign-in (the `/welcome`
  UTM bridge and the sequential onboarding funnel depend on it).
- **User identity:** on sign-in `analytics.identifyUser` (1) `alias(firebase_uid)`
  stitches a human's per-device / per-reinstall persons into ONE PostHog person (each
  keeps its own `install_id` distinct_id; the shared alias merges them), so
  retention/WAU dedupe natively; (2) stamps `firebase_uid` as a PERSON PROPERTY — the
  queryable join key to the auth system — plus `email` (`$set`) and `signup_date`
  (`$set_once`). On sign-out `analytics.reset()` returns to anonymous with a fresh
  distinct_id, which also prevents a shared device from merging two people.
  - **Identity discontinuity:** analytics aliases the Firebase uid, not the old
    Supabase id, so historical joins keyed on the retired `supabase_user_id` no longer
    stitch to post-migration persons. An intentional break at the GCIP cutover.
- **Super properties** (`baseSuperProps()` + registration at init):
  `app_version`, `app_os` (normalized `macos`/`windows`/`linux`/`unknown`), `os` (raw
  legacy `navigator.platform`), `is_debug` (`import.meta.env.DEV` — filter it out in
  dashboards), `session_id`, `environment` (web only, from
  `window.__HOUSTON_DEPLOY_ENV__`; unset on desktop, where `is_debug` already
  separates dev from release), `install_id`, `days_since_install`, and `auth_status`
  (`anonymous` → `authenticated` on sign-in, plus `auth_platform: "gcp"`).
- **Privacy:** no workspace names, agent names, raw prompts, raw message text, file
  paths, session keys, or raw error text in event props. Email is allowed only as a
  person property after auth, never as an event property.
- **Analytics in `app/` only** — never in `ui/`. Library boundary rule applies.

### Onboarding survey events

The three-question survey emits viewed, selected, and continued events for job,
industry, and automation goal, plus `onboarding_survey_prompted` for the
profile-completion prompt. Confirmed answers become person properties; free text
is truncated to 500 characters and never sent as an event property.

### Adding an event

```typescript
import { analytics } from "@/lib/analytics";
analytics.track("event_name");
```

Names + props are allowlisted in `AnalyticsEventName` / `AnalyticsProperty`. Add only
if tied to a dashboard question. Fire-and-forget, never throws/blocks; not configured
→ silent no-op. Do NOT use raw autocapture event lists for product decisions — if a
question needs click-level data, prefer one temporary named event and delete it after
the decision.

### Event surface

- **Growth:** `app_active` (once per install per UTC day), `install_created`
- **Activation:** `workspace_created`, `provider_configured`, `agent_created`,
  `chat_message_sent`, `chat_message_received`
- **Engagement:** `mission_created`
- **Reliability:** `session_failed`, `app_error_shown`, PostHog `$exception` from JS
  global handlers + the React error boundary

**Activation milestone: `chat_message_sent`** — the user sends their first message
(activation = the user acts, not the agent's reply). The app flips the `is_activated`
person property on this event; configure `chat_message_sent` as the activation event
in PostHog so server-side insights match, and key all retention/funnel insights off
it. **Changed from `chat_message_received` in PR #562** — `is_activated` values set
before that ship date reflect the old reply-based definition, so treat the cutover as
a discontinuity in any longitudinal comparison.

### Onboarding funnel (acquisition → activation)

One action-first event per first-run step, all carrying `app_os` so a single funnel
splits Mac vs Windows. In wizard order:

1. `install_created`
2. `onboarding_language_selected {locale}`
3. `user_signed_in {provider}`
4. `onboarding_agreement_accepted`
5. survey events (`app/src/components/onboarding/survey-analytics.ts`):
   `onboarding_{segment,industry,goal}_screen_viewed` → `*_selected` →
   `*_continued` (the `continued` events set the person properties)
6. `onboarding_started {source: in_app | in_app_replay}`
7. `onboarding_step_viewed {step}` — one per setup step reached, ref-guarded so
   re-renders don't refire
8. `ai_provider_connected {provider}`
9. `integration_connected {integration_slug}`
10. `agent_created {config_id}`
11. `first_message_sent`
12. `first_email_sent {provider}` — the agent sent the first real email
13. terminal: `onboarding_completed {source: in_app | in_app_replay}`

- **`install_created` must precede every onboarding step.** It fires from
  `<StartupEffects>` at the top of the tree (above the language/disclaimer gates), NOT
  from App's mount effect, because those gates block `<App/>` from mounting on a fresh
  install; emitting it late breaks the sequential funnel at step 2.
- **The login step reuses the shared `user_signed_in` Auth event** (sign-in lives
  inside onboarding since #447), not a dedicated `onboarding_*` one: it already fires
  on every path — email 6-digit code (`provider: "email"`), Google and Microsoft via
  desktop loopback OAuth or the deep-link fallback (`"google"` / `"azure"`). Unlike the
  other steps it is NOT ref-guarded once-per-install (it also fires on re-logins), but
  the sequential funnel keys on the first occurrence per person.
- The connection/email events fire on the actual action (status poll / completion
  token), ref-guarded to fire exactly once per install.
- **Removed with their steps:** `onboarding_welcome_continued` (welcome screen) and
  `onboarding_assistant_named` (naming step). Houston ships one default assistant with
  no welcome or naming screen, created **silently** the instant the AI connects — and
  that silent create is what fires the Activation `workspace_created`
  ([agent-manifest.md](agent-manifest.md)).

### Web ↔ app journey (one PostHog project)

The marketing site shares the **same** `POSTHOG_KEY`, so the whole
acquisition→activation journey is one project.

- **Download gate (one modal, HOU-1168):** the invite code is GONE. Downloading asks
  for the old waitlist's lead form (name, email, phone + country code, LinkedIn,
  country) in a single two-step modal (`landing/download-modals.njk` +
  `assets/download-gate*.js` + `assets/css/download-gate.css`, config injected by
  `landing/scripts-download.njk`). Submitting writes to the same Supabase `waitlist`
  table (`source: "download_gate"`, 409 duplicate = success) plus the Sheet mirror,
  sets `localStorage.houston_dl_registered` so returning visitors skip straight to the
  buttons, and reveals OS-aware buttons (pinned `data-dl-os` or `detectOs()`; the
  Windows x64/ARM64 promote logic keys off the preserved `dl-windows-*` ids).
  - Button hrefs come from the shared resolver
    `website/src/_includes/installer-urls.njk` (`window.houstonInstallerUrls()`, also
    used by `/early-access`): an unauthenticated
    `api.github.com/releases?per_page=30` fetch at page load picking the newest
    `cloud-vX.Y.Z` prerelease carrying installers. **NOT `releases/latest`** — that
    returns the newest stable tag, which is the LEGACY app kept for migrating users
    (and `cloud-latest` holds only the updater manifest).
  - **Contract (regressed once — "unlocked but nothing happened"):** buttons
    re-validate when the releases fetch settles; on fetch failure or a 403 rate-limit
    (60 req/hr per client IP — hits offices/NATs) they fall back to the GitHub releases
    page instead of staying dead. A Supabase write failure surfaces inline in the modal
    and keeps the form editable — never a silent dead end.
  - The standalone `/waitlist/` page was deleted; `/waitlist/` 301s to `/#download`
    (firebase.json + `_redirects`).
- **Web funnel:** `$pageview` (landing, `capture_pageview: true` in `base.njk`) →
  `app_download_clicked { os }` (any `[data-dl-trigger]` opening the gate) →
  `download_form_submitted { source }` + `download_unlocked { source }` →
  `download_started` / `windows_download_started { arch }`. Granular companions:
  `download_clicked { source }`, `download_os_switched { to }`. Break down by `os`.
  - Stopped firing with HOU-1168 (Aug 2026): `windows_modal_opened` and the waitlist
    events (`waitlist_submitted`, `waitlist_clicked`, `skip_waitlist_expanded`,
    `x_follow_clicked`). The per-OS button sources `hero-windows` / `pricing-windows`
    stopped in July 2026 when the Mac/Windows button pairs collapsed into single
    buttons.
- **App funnel:** `install_created → … → first_email_sent` (break down by `app_os`).
- **download→install hop:** there is no per-binary token, so the aggregate ratio of
  `app_download_clicked` (web) vs `install_created` (app) over the same window, split
  by os, IS the "did the download become an install" metric.
- **Identity bridge (per-person stitch):** on first launch `App.tsx` opens
  `gethouston.ai/welcome?install_id=<id>` in the browser;
  `website/src/welcome/index.html` calls `posthog.alias(installId)` +
  `identify(installId)`, merging the anonymous web person (with `$initial_utm_*`, kept
  alive by `person_profiles: 'always'`) INTO the install identity. This is the
  canonical bridge — it covers every install regardless of how the app is launched. A
  `houston://welcome?ref=` deep-link bridge was considered and rejected: lower coverage
  and a competing merge path.
- Per-event short URLs (e.g. `gethouston.ai/yc-demo-day-2026`) live in
  `website/src/_redirects` and 302 to the UTM-laden landing page — one line per
  campaign. End-to-end attribution flow: `growth/utm-conventions.md`.

### Dashboards — canonical set (tag `canonical-2026-05`)

8 themed dashboards, each opening with one question; the numeric prefix sets sidebar
order to match daily reading flow:

1. **Acquisition** (1631626) — installs over time + UTM-campaign + `app_os` breakdown
2. **Activation** (1631629) — install → activation funnel, time-to-activation,
   onboarding completion
3. **Engagement** (1631631) — DAU/WAU/MAU, stickiness, messages-per-active-day
4. **Retention** (1631635) — weekly cohort retention, growth accounting,
   attribution-cohorted retention
5. **Feature Adoption** (1631636) — skill_used, tab_opened, integration_connected,
   routine_executed, update funnel
6. **Reliability** (1631644) — app_error_shown by error_kind, session failures, error
   rate by app_version
7. **AI Usage** (1631647) — LLM cost / latency / errors / generation calls (PostHog
   LLM-observability auto-events)
8. **B2B** (1631648) — multi-user company domains, messages-by-domain

`is_debug != true` is applied at the project level via the `Internal / Test users`
cohort — exclude that cohort from every insight as a project-wide convention.

Old dashboards (`Houston Growth + Reliability` 1517531, `Houston Acquisition Funnel`
1522835, `My App Dashboard` 1507849) are tagged `legacy-pre-2026-05` and unpinned;
their insights live on, mostly cross-attached to the new ones.

### `tab_opened` — the live `tab_name` vocabulary

The event name survived every shell change; the values did not. `tab_name` no longer
carries per-agent tab names — it carries view-mode, settings-section and org-section
ids, from exactly four emitters:

| Emitter | `tab_name` | Values |
| --- | --- | --- |
| `shell/use-workspace-view-guards.ts` (every top-level view switch) | the raw `viewMode` | `inbox`, `team`, `ai-hub`, `integrations-home`, `skills-home`, `agent-store` (`settings` deliberately skipped) |
| `settings/settings-view.tsx` | `settings` (index) or `settings:<section>` | `SETTINGS_SECTION_IDS`: `profile`, `apiKeys`, `workspaceContext`, `userContext`, `shortcuts`, `reportBug`, `migration`, `timeWorked`, `permissions`, `organization` |
| `permissions/permissions-view.tsx` | `permissions:<section>` (+ an `agent_id` prop) | the agent settings rail sections: `job-description`, `learnings`, `people`, `integrations`, `models`, `skills` — the one ACTUALLY shown, never the one requested |
| `organization/organization-view.tsx` | `org:<section>` | the Admin page's `OrgTabId`s: `people`, `activity`, `usage`, `billing` |

Settings owns its own surfaces outright (the shell's generic view-switch effect skips
`settings`), so a deep link counts once, on the render that really shows the surface.

**Two dead series live in the historical data — do not read either cliff as a
regression:**

1. HOU-788 moved Usage, Permissions and Admin out of top-level views into Settings
   sections (`usage` → `settings:usage`, `permissions` → `settings:permissions`,
   `organization` → `settings:organization`). HOU-790 renamed the first again (Usage →
   **Time worked**, `settings:timeWorked`) and killed the pane-level `usage:compute` /
   `usage:models` events with their panes.
2. The **per-agent tab shell** was deleted. A tab used to BE the `viewMode`, so the
   strip's ids went straight onto `tab_name`: `activity`, `context`, `skills`,
   `integrations`, `routines`, `files`, `admin` (and the older `chat` /
   `job-description`). Nothing emits any of them now — the traffic moved to `team` and
   `permissions:<section>`.

Feature Adoption tiles breaking `tab_opened` down by `tab_name` show both sets
flat-lining at their release boundaries. **Add the current names to any saved
breakdown filter** rather than reading the drop as lost usage.

### Pulling a contact list of users on stale versions

The dashboard tile shows COUNTS. To actually reach people, use PostHog **Persons**
(not Insights):

1. Persons → "New cohort" (or an ad-hoc filter).
2. Filter `app_version` (super property, type **Event property**) `is not`
   `<latest version>`. Repeat with `is_set` to exclude persons missing it.
3. Optionally filter `email is_set` — only signed-in users have an email.
4. Export as CSV. Columns of interest: `email`, `email_domain`, `app_version`,
   `install_os`.

Caveats: `app_version` is a SUPER property on events, not a person property, so
filtering it on Persons only works if PostHog saw that person fire an event in that
version — long-dormant users may not show. Anonymous users have no `email` (their
count on the tile vs the exportable cohort = the unreachable delta). The
`is_debug != true` filter applies to the tile but NOT to a Persons export — add it to
the cohort definition manually.

### BigQuery export (optional)

PostHog → BigQuery plugin → target GCP project (burns credits). SQL-queryable event
history forever, immune to PostHog retention limits. Useful for investor-update
analytics.

## In-app bug reports (Linear issue creation)

- **User-initiated only.** The error toast has no "Report bug" action — auto-report
  superseded it ([sentry.md](sentry.md) → *Auto-report flow*). Four surfaces:
  Settings → Report bug (`settings/sections/report-bug.tsx`), the sidebar's Send
  feedback dialog (`shell/feedback-dialog.tsx`), the in-chat tool-runtime error card
  (`shell/tool-runtime-error-card.tsx`), and the provider error cards' report button
  (`shell/provider-error-cards/shared.tsx`). All four call
  `app/src/lib/bug-report.ts`, which bundles recent frontend + backend log tails into
  a provider-neutral payload and hands it to the `report_bug` OS bridge.
- **"Send feedback" is the catch-net** — always available in the sidebar user menu,
  opens a textarea, submits through the same `report_bug` command with the typed
  message in `BugReportPayload.user_message` so `format.rs` leads the issue title and
  description with it ("Houston feedback: …" instead of "Houston bug: …"). For things
  Sentry can't see: UX confusion, feature requests, soft errors.
- **Native delivery (desktop):** `app/src-tauri/src/bug_report/` creates a Linear
  issue with `reqwest` against `https://api.linear.app/graphql`. Do not post from the
  webview — the Linear API key does not belong in the JS bundle.
- **Cloud delivery (web / hosted):** the web build has no Tauri, so
  `packages/web/src/shims/tauri-core.ts` posts the same payload to the gateway's
  `POST /feedback`, which fronts the identical Linear intake. It goes through
  `gatewayAuthFetch` (`engine-adapter/cp/fetch.ts`) like every control-plane call —
  live bearer read per attempt, ONE single-flight 401 refresh + replay, and the
  `X-Houston-App-Version` header — so a report typed after the tab idled past token
  expiry still lands. **Deliberately no `x-houston-org`**: the gateway's `ResolveOrg`
  403s `not_member` on a stale space selector and `/feedback` never reads the org, so
  pinning the active space would silence exactly the user who was just removed from
  their team. Non-2xx throws the gateway's `error` string, else
  `feedback failed (<status>)`. Outside cloud mode the shim throws its desktop-only
  error.
- **Failure telemetry (HOU-818):** a bug report that fails to send is the failure we
  would otherwise never hear about, so the ad-hoc error-toast path reports too.
  `logAndReportError(command, err)` (`error-toast.ts`) logs the raw diagnostic AND
  captures to Sentry with no toast of its own; `genericErrorDescription` (the body of
  ~40 ad-hoc error toasts, including the bug-report surfaces) delegates to it, and
  handlers that own their copy call it directly with a flat command tag.
  - **One failure, one issue:** every `call()`-backed engine failure is already
    captured by `surfaceError` (`lib/tauri.ts`), which stamps the error with the
    `Symbol.for("houston.error.reportedToSentry")` marker; `logAndReportError` logs a
    marked error but skips the second capture. Non-`call()` paths (the raw `report_bug`
    invoke, clipboard writes, os-bridge calls) are unmarked and report normally.
  - The workspace store therefore does NOT report `loadWorkspaces` failures itself —
    `tauriWorkspaces.list` is a `call()` and owns the toast + report; the store's catch
    only records `loadError` so `workspaceGateState` (`lib/workspace-switch.ts`) can
    tell loading from load-failed from settled-but-empty. `SettingsView` is the screen
    wired to that gate: a failed load offers a retry instead of an endless spinner, and
    an error-free empty result gets neutral copy rather than a bogus "check your
    connection". The gate covers the Settings index and every ORIGINAL section, never
    the three MOVED surfaces (Time worked / Permissions / Admin, HOU-788) —
    `settingsSectionNeedsWorkspace` exempts them: they read org/billing/usage, never
    `GET /v1/workspaces`, and moving them into Settings must not hand them a
    precondition they never had, least of all on the billing recovery path. The store
    also exposes `loaded` so App.tsx's boot splash covers only the initial load and a
    retry spins in place instead of remounting the shell.
- **Config:** `LINEAR_API_KEY` + `LINEAR_TEAM_ID` are read from runtime env,
  `app/.env.local`, `app/src-tauri/.env.local`, and `option_env!()` for release
  builds; CI passes them in `release.yml`. **Release builds embed the key in the
  native app** — never use a broad Linear key; restrict it to "Create issues" on the
  target team only. Reports look up and apply the `User Bug` label; override with
  `LINEAR_BUG_LABEL_NAME`.
- **Local smoke:**
  `cd app/src-tauri && LINEAR_API_KEY=... LINEAR_TEAM_ID=... cargo test creates_real_linear_issue_when_env_is_set -- --ignored`
  creates one real Linear issue.

## Required env vars

These are **release/CI** vars baked at build time. Day-to-day development uses the
two-file model instead — committed `.env.development` + secrets-only `.env.local`,
validated by the doctor ([dev-loop.md](dev-loop.md)).

Shell (local builds) AND GitHub Secrets (CI):

| Var | Purpose | Source |
|-----|---------|--------|
| `APPLE_SIGNING_IDENTITY` | Developer ID | Apple Developer portal → Certificates |
| `APPLE_API_KEY` | App Store Connect key ID | ASC → Users → Keys |
| `APPLE_API_KEY_PATH` | Path to `.p8` key | Downloaded when creating key |
| `APPLE_API_ISSUER` | ASC issuer UUID | ASC → Users → Keys |
| `TAURI_SIGNING_PRIVATE_KEY` | Ed25519 key for update signing | `pnpm tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for above | Set during gen |
| `POSTHOG_KEY` | PostHog project API key (client-side, public-safe) | PostHog → Project settings |
| `POSTHOG_HOST` | PostHog ingest host | `https://us.i.posthog.com` |
| `POSTHOG_PERSONAL_API_KEY` | Personal API key (scope `annotation:write`) used by `finalize` to mark each release on PostHog charts. Empty → the annotation step is skipped. | PostHog → Personal API keys |
| `POSTHOG_PROJECT_ID` | Numeric project id the annotation lands under | PostHog → Project settings |
| `FIREBASE_API_KEY` | GCIP / Firebase Web API key (public, baked) | GCP → Identity Platform → project `gethouston` → Web app config |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain (public, baked) | Same Web app config (`gethouston.firebaseapp.com`) |
| `FIREBASE_PROJECT_ID` | Firebase project id — `gethouston` (public, baked) | Same Web app config |
| `GOOGLE_DESKTOP_CLIENT_ID` | Desktop loopback Google OAuth client id | GCP → Credentials → OAuth client (Desktop) |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | Desktop loopback Google OAuth client secret (desktop clients are not confidential; safe to bake) | Same OAuth client |
| `MICROSOFT_DESKTOP_CLIENT_ID` | Desktop loopback Microsoft OAuth client id | Azure → App registrations |
| `LINEAR_API_KEY` | Create in-app bug-report issues | Linear → Settings → Security & Access → Personal API keys |
| `LINEAR_TEAM_ID` | Target team for bug reports | Linear command menu → Copy model UUID |
| `SENTRY_DSN` | Crash reporting DSN baked at build time | Sentry → houston-cd → houston-app → Client Keys |
| `SENTRY_SEND_IN_DEV` | Opt-in (truthy) to send Sentry events from a dev build; unset → dev builds suppress. Ignored by release builds. | Set locally only when testing crash reporting |
| `SENTRY_AUTH_TOKEN` | sentry-cli auth for sourcemap + debug-symbol upload. Scopes: `project:releases`, `project:read`, `org:read`. Unset → the upload step is skipped. | Sentry → Auth Tokens |
| `HOSTED_ENGINE_URL` | Managed-gateway base URL, baked on the `cloud-v*` channel TWICE: as `VITE_HOSTED_ENGINE_URL` (the app talks to Houston Cloud) and as `HOUSTON_INTEGRATIONS_URL` (compile-time `option_env!` in `app/src-tauri/src/lib.rs`, handed to the spawned LOCAL engine sidecar so connected apps + the onboarding email step work there too — the gateway serves `/v1/integrations/*` on the same base). Empty on plain `v*` tags → local-engine integrations off. | Cloud deployment |
| `HOSTED_ENGINE_URL_STAGING` | Staging gateway URL. Baked into the staging QA DMG (`build-macos` `flavor: staging`) and the preview web bundle (`web-staging.yml`). `prep` guards it non-empty on `cloud-v*`. | Cloud deployment (staging) |

CI-only Secrets:

- `APPLE_CERTIFICATE` — base64 `.p12` · `APPLE_CERTIFICATE_PASSWORD`
- Windows Authenticode (all six or the MSI ships unsigned + a `::warning::`):
  `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` — Entra app
  registration `houston-release-signer` holding the "Artifact Signing Certificate
  Profile Signer" role (client secret expires ~July 2028 — rotate via
  `az ad app credential reset`); `AZURE_SIGNING_ENDPOINT`
  (`https://eus.codesigning.azure.net`); `AZURE_SIGNING_ACCOUNT` /
  `AZURE_SIGNING_PROFILE` (account `gethouston`, resource group `houston-signing`,
  eastus + Public Trust profile `houston-public-trust`)
- `RELEASE_CUT_TOKEN` — fine-grained PAT that pushes the `cloud-v*` tag (a
  default-`GITHUB_TOKEN` tag push would not trigger `release.yml`)
- Marketing site (`website-deploy.yml`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `WAITLIST_SHEET_ENDPOINT`, `CERTS_EXPORT_TOKEN`, plus `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` until the DNS flip ([hosting.md](hosting.md))

**Never hardcode.** Read via `option_env!()` in Rust (compile-time); pass as env vars
in CI.

## Windows Authenticode signing (Azure Artifact Signing)

The SmartScreen "Windows protected your PC" interstitial on the downloaded MSI is a
signing + reputation problem, solved in `release.yml`'s `build-windows` job.

- **Service:** Azure Artifact Signing (formerly "Trusted Signing"), account
  `gethouston` under Taxflow Inc.'s validated org identity. Managed Authenticode certs
  (short-lived, auto-rotated), Microsoft is the CA.
- **Wiring:** when the six `AZURE_*` secrets are set, a CI-generated Tauri config
  overlay sets `bundle.windows.signCommand` to `artifact-signing-cli` (pinned via
  `cargo install`; the overlay is written with node because jq is absent on
  `windows-11-arm`). Tauri then signs every bundled binary (houston-app.exe, sidecars,
  the MSI itself) during `tauri build` — not a post-hoc MSI-only pass. An overlay, not
  `tauri.conf.json`, so local builds never touch Azure. Secrets absent → loud
  `::warning::` and the unsigned build stays green; `AZURE_CLIENT_SECRET` set but a
  sibling empty → hard `::error::`.
- **Verification:** a post-build pwsh step hard-fails the release if the MSI signature
  isn't `Valid` + timestamped. Expect signer `CN=Taxflow Inc., O=Taxflow Inc.`.
- **Two signatures, different jobs:** Authenticode satisfies Windows/SmartScreen; the
  Tauri updater minisign `.sig` satisfies the in-app updater. Both required.
- **Reputation:** SmartScreen warnings fade as download history accrues per
  certificate + file hash. To accelerate after the first signed release, submit the
  MSI at https://www.microsoft.com/wdsi/filesubmission (software-developer flow).
  **Never rotate/delete the Azure signing identity casually** — reputation is bound to
  it.

## CI/CD (GitHub Actions)

- **Workflow:** `.github/workflows/release.yml`. **Trigger:** push a tag matching
  `v*`.
- **Engine:** builds the desktop app around the **bun-compiled Houston host sidecar**.
  A plain `pnpm tauri build` builds the host too (no cargo feature to opt in). No
  provider CLIs are bundled — pi runs providers in-process.
- **Output:** a DRAFT GitHub Release with a signed + notarized universal DMG, signed
  Windows MSIs (x64 + arm64), an updater-signed Linux AppImage, and `latest.json`
  advertising all three platforms. **Draft = QA gate** — users don't see it until
  published.
- **Duration:** ~25-30 min wall-clock (mac + win + linux in parallel; mac is the long
  pole at ~25 min including Apple notarization).

### Job graph

```
prep (ubuntu, ~30s)               creates empty draft + release-notes.md artifact
  ├── build-macos (mac, ~25m)     matrix [prod, staging on cloud-v*] — bun-compiles host sidecar (both arches) → signs, notarizes, uploads DMG/tar/sig/latest.json (staging leg: one renamed DMG only)
  ├── build-windows (win, ~15m)   bun-compiles host sidecar per arch → uploads MSI + .sig (x64 + arm64)
  ├── build-linux (ubuntu, ~15m)  bun-compiles host sidecar → repairs AppImage → updater-signs the REPAIRED file → uploads AppImage + .sig
  ├── build-web (ubuntu, ~5m)     builds packages/web → uploads web-dist.tar.gz + Sentry maps
  └── finalize (ubuntu, ~30s) [needs mac + win + linux] extends latest.json with windows + linux entries, posts Slack
```

Mac, Windows, Linux and web run in parallel — they only need the empty draft `prep`
creates. `finalize` stitches `latest.json` together (the macOS-only base plus the
Windows entries from the MSI `.sig`s and the `linux-x86_64` entry from the AppImage
`.sig`, PRODUCT-1387) and posts the team Slack notification. Since Linux joined the
updater, build-linux is a hard `finalize` dependency — a broken Linux leg blocks the
manifest (fail-closed; an entry-less manifest would silently re-strand Linux users).
The AppImage's updater `.sig` is minted AFTER the sidecar repair (a sig from `tauri
build` would cover the pre-repair bytes and every client would reject the download);
only web stays outside the updater. AppImage installs from before this wiring point
at the legacy feed and must redownload once. Slack lives in `finalize` because it
needs `release-notes.md`, published as an artifact by `prep`.

### Build guards

- **Sidecar staleness (release-only):** `scripts/build-host-sidecar.sh` stamps each
  compiled sidecar with the git HEAD it built at (`<binary>.stamp`) and its `--verify`
  step asserts `/v1/catalog` returns a non-empty array. On a RELEASE build `build.rs`
  panics if any of the sidecar's input paths changed since that stamp commit
  (committed, staged, unstaged, or untracked). Guard against the v0.5.2 incident (a
  host predating `/v1/catalog` bundled silently, leaving the app with providers but
  zero models). Debug builds skip it. Detail: `CLAUDE.md` → *Host sidecar staleness*.
  - **⚠️ The guard's input set includes root `package.json` + `pnpm-lock.yaml`, so any
    CI step that mutates a manifest BEFORE `tauri build` must restore it** or the
    release panics with "STALE: … uncommitted … edits to sidecar input files". The
    macOS "Force-install both macOS Claude SDK platform packages" step runs
    `pnpm add -w …@ver --force` to land BOTH per-arch
    `@anthropic-ai/claude-agent-sdk-darwin-{arm64,x64}` in the pnpm store (the
    universal lipo needs both slices; `pnpm install` resolves only the runner-native
    one), which rewrites both manifests. The fix:
    `git checkout HEAD -- package.json pnpm-lock.yaml` immediately after —
    `build-host-sidecar.sh` `cp`s the `claude` binary straight out of
    `node_modules/.pnpm/…` (never re-installs, never reads the manifest), so restoring
    the tracked files leaves the store packages in place. Origin: the Force-install
    step (PR #675) predated the guard adding the manifests to `SIDECAR_INPUT_PATHS`
    (PR #729), which turned a benign mutation into a hard macOS-release failure.
- **Engine-pod catalog artifact (the managed-cloud twin):** `engine-pod-image.yml`
  publishes the catalog the engine serves as a tiny sibling image alongside every
  `engine-pod:<git-sha>` build. After build+push and BEFORE the "Notify cloud repo"
  dispatch, it boots the just-built pod (one dummy `HOUSTON_HOST_TOKEN`;
  `/v1/catalog` is public and served from pi-ai's static in-process registry, so no
  gateway/DB env is needed), curls `/v1/catalog`, asserts a non-empty JSON array
  containing the `anthropic` provider (**build fails otherwise — never a silent
  skip**), then pushes it as `FROM scratch` + `COPY catalog.json /catalog.json` to
  `us-east1-docker.pkg.dev/gethouston/houston/engine-pod-catalog:<git-sha>`.
  **Contract with cloud:** `roll-engine.yml` / `roll-engine-staging.yml` (private
  gethouston/cloud) fetch it by the same dispatched `<git-sha>` and serve
  `/catalog.json` live from the gateway, so the gateway's `/v1/catalog` can never
  drift from the engine fleet.
- **Linux AppImage Bun repair:** linuxdeploy runs `patchelf` on every dynamic ELF and
  adds `$ORIGIN/../lib` as RUNPATH. A Bun standalone executable carries its bundled
  JavaScript as an appended ELF payload; that mutation made the packaged
  `houston-engine` segfault before `HOUSTON_HOST_LISTENING` even though pre-bundle
  verification passed (v0.5.6 on Arch/Omarchy). After Tauri creates the AppImage,
  `scripts/ci/repair-linux-appimage-sidecar.sh` extracts it, restores the
  byte-identical sidecar from `target/host-sidecar`, rebuilds the SquashFS behind the
  original AppImage runtime, and reads the payload back to verify. **This repair must
  stay before checksum generation and upload.**
- **Whisper dictation sidecar (`scripts/build-whisper.sh`):** each runner builds
  `whisper-cli` for its own arch natively (no cross toolchain on Linux/Windows); a
  same-OS arch mismatch is rejected.
  - **⚠️ Windows-on-ARM host detection:** the `windows-11-arm` runner's Git Bash is an
    x86_64 MSYS binary under Windows' x64 emulator, so `uname -m` reports `x86_64`
    even though the CPU is ARM64 — which false-tripped the native-arch guard and failed
    EVERY arm64 Windows release. `host_arch()` now resolves the true arch from
    emulation-immune signals in order: `RUNNER_ARCH` (GitHub-set, authoritative in CI)
    → `PROCESSOR_ARCHITEW6432` → `PROCESSOR_ARCHITECTURE` → `uname -m`. (rustc/bun in
    the same job always detected arm64 correctly — only MSYS `uname` was wrong.)

### Staging QA DMG (cloud channel)

Every `cloud-v*` release builds a SECOND macOS DMG,
`Houston_staging_<version>_universal.dmg`, via a `flavor: [prod, staging]` matrix on
`build-macos` (local `v*` tags stay a single `prod` leg). Same commit, same pipeline,
same signing + notarization; the staging leg differs in exactly two bakes: the gateway
URL comes from `HOSTED_ENGINE_URL_STAGING` (guarded non-empty in `prep`), and the
updater endpoint is rewritten to a never-created tag by
`scripts/ci/point-updater-at-staging-noop.sh` so the forced-update-at-launch flow can
never replace a staging install with the published prod build (update checks are
fail-open — warn-and-continue). Staging artifacts never enter `latest-cloud.json`,
checksums, or Sentry; the leg uploads exactly the one renamed DMG. Purpose: QA the
exact shipped binary against the staging engine fleet (which auto-rolls on every merge
to main) before publishing the draft. The finalize Slack message's primary button is
the staging DMG on the cloud channel.

### Main's version must clear the gateway's update floor

The hosted gateway enforces an OPTIONAL per-channel **minimum app version** and
answers *every* request with `426 {"error":"app update required","minVersion":...}`
below it. A hosted build identifies itself as `<app/package.json version>+<channel>`
via `X-Houston-App-Version` (`app/src/lib/update-floor.ts`); a build with a baked
gateway is channel `cloud`.

- **The trap:** the release cut commits the version bump ONLY under the tag and never
  pushes it to protected main, so main's version files do not advance on their own.
  They sat at `0.5.9` while the released line reached `0.5.41`. Anything built from
  main — a local `pnpm tauri build`, or `pnpm dev:staging` — therefore identified as
  `0.5.9+cloud`, under staging's `0.5.19` floor, and died at boot: the onboarding
  screen showed only "Something unexpected went wrong" while the console filled with
  426s. CI builds were never affected, because the tag commit carries the bump.
- **The invariant:** main's version must stay at or above the floor of any gateway you
  point a locally-built app at. Practically, keep it at the newest released `cloud-v*`
  version — do NOT set it to the next unreleased patch, or the cut's `git commit` finds
  an empty diff and fails. `scripts/dev/staging.sh` pre-flights this and WARNS (never
  blocks) when the checkout is behind the newest tag, since a one-patch lag right after
  a cut is normal. Fix a lagging checkout with
  `./scripts/version.sh <newest-cloud-v>`.

### Daily cloud cut (`daily-cloud-cut.yml`)

- **`workflow_dispatch`-only — the scheduler is a Houston routine** (PRODUCT-1329):
  a cloud agent dispatches the workflow weekday mornings (~07:00 Bogotá), passes
  agent-written user-facing release notes via the `notes`/`notes_es`/`notes_pt`
  inputs (written to `.github/release-notes/<version>[.es|.pt].md` inside the
  release commit, so release.yml treats them as authored notes and the updater
  embeds them), watches the run, and posts the outcome to Slack — see
  [daily-cut-routine.md](daily-cut-routine.md). The old GitHub cron was dropped:
  its best-effort queue fired 30-120 min late (HOU-1013) and needed a ~103-min
  fudge factor; Houston's cron fires on time.
- Replicates the manual cut: branch from main tip → `scripts/version.sh` →
  `release: v<version>` commit (lives only under the tag, never pushed to protected
  main) → annotated `cloud-v<version>` tag pushed with the `RELEASE_CUT_TOKEN`
  fine-grained PAT (a default-`GITHUB_TOKEN` tag push would not trigger `release.yml`
  — recursive-workflow guard).
- Guards: skips quietly when main has no new commits since the last cut; refuses to
  cut a red main (failed completed check-runs) and pings the release Slack webhook.
  After tagging it deletes every never-published `cloud-v*` draft below the new
  version (release + tag) — an unshipped train's work rolls forward, and stale drafts
  risk publishing the wrong build.
- Manual / off-schedule: `workflow_dispatch`, optional `version` override.

### Linear release stamp (`linear-release-stamp.yml` + `scripts/linear-release-stamp.mjs`)

The train's Linear bookkeeping, as an observer (the script exits 0 on Linear failure —
a tracker outage can never block a cut or a ship). Two moments:

- **Cut (tag push):** labels the train `cloud-vX.Y.Z` (exclusive `Release` label
  group; a stale label from an unshipped draft is swapped). The train = issues the
  train's PRs resolve via magic words (both squash `(#N)` and `Merge pull request #N`
  subjects are parsed) **plus everything in App Review at cut time** — App Review means
  merged-awaiting-verification, so it ships in this build even when a PR forgot the
  magic words. The label IS the membership record; the QA filter is App Review + label.
- **Publish (ship button):** moves the label's carriers still in App Review (plus
  magic-word issues from any open state) to Released, comments the release link, and
  appends the internal + WhatsApp changelogs to the release body. Issues merged after
  the cut lack the label and wait for the next train; an issue QA bounced back to In
  Progress stays put.

Pure logic in `scripts/lib/release-train.mjs` (tested by
`scripts/lib/release-train.test.mjs`, wired into the CI vitest list); Linear actions in
`scripts/lib/release-stamp-actions.mjs`. **At publish the workflow runs from the TAG's
commit**, so stamp fixes only apply to tags cut after they merged.

### Ship train (`ship-train.yml`) — publish is the ship button

Publishing the `cloud-v<version>` draft (kept PRERELEASE) ships the whole train with
one click: `cloud-updater-manifest.yml` flips `cloud-latest` (desktops force-update)
and `ship-train.yml` promotes the prod engine fleet — it walks first-parent from the
release's base commit to the newest `engine-pod:<sha>` in Artifact Registry, fires the
`engine-pod-published-prod` dispatch (seq = epoch seconds, monotonic across sender
workflows), and stamps a non-triggering `engine-pod-v<version>` label tag at that sha
so app and engine share one version namespace. Manual `engine-pod-v*` tag pushes remain
the break-glass engine roll. The prod gateway/control-plane (cloud repo) is not yet on
this train.

## macOS Universal (arm64 + Intel)

Houston ships ONE DMG that runs natively on Apple Silicon AND Intel — same app, same
download, same update channel.

- `release.yml` bun-compiles the host sidecar TWICE (one per real triple:
  `aarch64-apple-darwin`, `x86_64-apple-darwin`) via
  `scripts/build-host-sidecar.sh <triple>`, then `lipo`s the two
  `target/host-sidecar/houston-host-<triple>` outputs into one fat
  `binaries/houston-engine-universal-apple-darwin` (the universal bundle's
  externalBin).
- `build.rs::stage_host_sidecar` also stages per-triple copies to
  `src-tauri/binaries/houston-engine-<triple>` during Tauri's per-arch cargo runs; the
  manually-lipo'd fat binary is what the `--target universal-apple-darwin` bundle
  ships. The externalBin NAME is kept from the old Rust engine so `tauri.conf.json` is
  unchanged.
- A verification step runs `lipo -info` on the embedded sidecar and fails the release
  if either slice is missing.
- `latest.json` ships FOUR platform keys (`darwin-aarch64`, `darwin-aarch64-app`,
  `darwin-x86_64`, `darwin-x86_64-app`) all pointing at the same tarball + signature.
  **Intel users on older installs check `darwin-x86_64` — if that key is absent they
  NEVER see the update prompt.**
- `bundle.macOS.minimumSystemVersion = 10.15` — required for Intel Macs old enough to
  matter.
- **Do NOT break Intel without warning.** Removing an arch from `release.yml` (or
  dropping `darwin-x86_64*` from `latest.json`) strands every Intel user silently.
  Migrate with a deprecation release first.

### Local universal build

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
scripts/build-host-sidecar.sh aarch64-apple-darwin
scripts/build-host-sidecar.sh x86_64-apple-darwin
lipo -create \
  target/host-sidecar/houston-host-aarch64-apple-darwin \
  target/host-sidecar/houston-host-x86_64-apple-darwin \
  -output app/src-tauri/binaries/houston-engine-universal-apple-darwin
cd app && VITE_NEW_ENGINE=1 pnpm tauri build --target universal-apple-darwin --features host-sidecar
```

Output: `target/universal-apple-darwin/release/bundle/{macos,dmg}/`. `pnpm tauri dev`
stays single-triple; `build.rs` falls back to `target/release/` when a per-triple path
is missing.

### Standalone host binary release

`.github/workflows/engine-release.yml` (tag `engine-v*`) bun-compiles the standalone
Houston host binary (`houston-host-<triple>` — the same self-contained binary the
desktop embeds as its sidecar, and the one a `selfhost/` operator can run directly
instead of the Docker image) for Linux (arm64 + x86_64 gnu) and macOS (arm64 + Intel).
Four artifacts, no Rust toolchain needed (bun only).

