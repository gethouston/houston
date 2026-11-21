# Web build: design decisions

Covers `packages/web/`: the web build of `app/src`, its Tauri shims, deploy environment and Playwright harness. Short file paths are relative to `packages/web/`.

## The web build composes the desktop tree

`packages/web` runs the desktop React tree from `app/src` in a browser tab against the Houston host. `app-tree.tsx` mirrors `app/src/main.tsx`'s provider and gate nesting but is owned by web so it can differ where the browser needs it. It shares the global error handlers with the desktop entry so both report the same way, and like desktop renders without StrictMode (portal and listener double-mount churn). Sentry initializes first so global handlers capture from the first render; an empty DSN is a silent no-op.

Lives in `packages/web/src/app-tree.tsx`, `vite.config.ts`.

## Boot order in the web entry

Globals are published before the app module graph loads, because shared modules read them at import: the deploy environment and `deployment` tag (Sentry and PostHog init), host mode and the engine endpoint (`app/src/lib/engine.ts` reads `window.__HOUSTON_ENGINE__` at import). A settings landing ticket (`?settings=linkedin&linkedin=<ticket>`, Slack's equivalent) is stripped from the address bar before anything loads, because `session_started` carries PostHog's `$current_url` and Sentry records URL changes; every root loads by dynamic import after that capture (asserted by `tests/boot-landing.test.ts`). The theme is applied before first paint on the desktop's contract: the engine preference is the source of truth.

Lives in `src/main.tsx`, `src/boot-globals.ts`, `src/deploy-environment.ts`.

## One bundle, environment from the hostname

One web bundle is built and promoted byte for byte from preview to production, so the environment is derived at runtime from the hostname. Production is a single canonical host; preview hosts, Firebase hosting domains and any unmapped host are never treated as production. Native builds publish their target before the web entry loads. A "Preview" pill marks non-production builds and is pointer-events-none so it never affects layout or clicks.

Lives in `src/deploy-environment.ts`, `src/preview-badge.tsx`.

## Cloud sign-in first, locale without blocking

With a baked Firebase identity, sign-in is the first screen; the first-run language picker is a desktop and self-host concept. The signed-in account's stored locale is applied when it arrives without blocking any screen. The live SDK session is mirrored into the engine bearer and the `["session"]` TanStack cache, and the adapter's 401 path force-refreshes the ID token and replays. A dev-only bearer (`VITE_CP_DEV_TOKEN`, with no Firebase configured) skips Firebase.

Lives in `src/cloud-login.tsx`, `src/app-tree.tsx`.

## Firebase on web

The firebase-js-sdk is reached only through the `@houston/web-identity` alias; `app/vite.config.ts` maps it to a stub so desktop never bundles it. Persistence settles before a popup opens so the session is stored under `browserLocalPersistence`. On iOS `getAuth` installs a resolver that loads Google's gapi iframe at startup, which the native shell refuses, so the auth instance is built without it there. A closed or superseded popup is a benign cancel that resolves `null`, not an error. Apple returns name and email only on first consent. GCIP puts only the account record's profile into ID token claims, so the provider profile is backfilled into the record and a refresh carries it; returning users never re-run the popup, so the backfill also runs on session restore. An account-exists refusal holds the credential and links it onto the session the email code minted.

Lives in `src/identity/*.ts`, `vite.config.ts`.

## Tauri shims

Every `@tauri-apps/*` module the app imports has a web shim. Behaviours with a browser equivalent are implemented (downloads via an anchor with delayed revoke, file pickers with a focus-based cancel fallback because Safari and older Chromium do not emit `cancel`, `open_url` reporting whether the popup blocker refused, notifications through the Notification API with click mapped to `window.focus()` so the desktop focus-proxy navigation path works, bug reports through the gateway's `POST /feedback` with the shell's typed `{kind, message}` rejection). Features absent on web are honest no-ops (`false` means unsupported, `null` means nothing found, so wizards and buttons hide). Desktop-only commands (native loopback sign-in listeners, Codex callback relay, `claude` CLI login, keychain reads, local model bridge, dictation, legacy migration, updater) throw a clear error. The updater shim's `check()` never offers an update.

Lives in `src/shims/*.ts`, `src/report-bug-intake.ts`.

## Vite config mirrors desktop

Build-time globals and Firebase public values mirror `app/vite.config.ts` for define parity; consumers guard with `typeof __X__ !== "undefined"`. The Firebase API key is public, not a secret. `pnpm dev:host` loads the shared repo-root `.env.local`. Workspace UI packages are not pre-bundled so edits flow through. Alias order matters: the `/*` regex precedes the bare alias. Source maps are `hidden`: emitted without the `sourceMappingURL` comment. `server.fs` allows the monorepo because sources live outside the package. The dev server port and cacheDir are overridable per worktree so parallel e2e runs never share a server.

Lives in `packages/web/vite.config.ts`.

## Self-host connect screen

A browser has no supervisor to mint an endpoint, so self-host users enter the host URL and token. The probe targets the host's pre-agent `/setup-runtime/*` surface, validating reachability (HTTPS plus CORS) and the token (401). The gate is a reachability check only; cloud mode skips it because cloud is keyless. The connect UI renders in the entry chunk before app CSS loads, so it uses inline styles, is deliberately dark in both themes, and uses 16px inputs so iOS Safari does not zoom on focus. The stored config key's `.new` suffix is historical and kept so stored configs still read.

Lives in `src/new-engine/*.tsx`, `src/new-engine/styles.ts`, `src/engine-config.ts`.

## Operator dashboard at /admin

The dashboard renders outside the app tree, so it imports the token CSS itself, uses inline `var(--ht-*)` styles, and carries its own resets because no Tailwind preflight reaches it. Hex-alpha cannot apply to a `var()`, so translucent washes are composited explicitly. It is deliberately dark whatever the device prefers (DESIGN.md section 3 rule 4), pinned on the document root too. Auth is GCIP (Google popup or email and password, accounts provisioned by the platform). Sessions persist in localStorage (blocked storage keeps the session in memory for the tab), refresh proactively before expiry, retry transient failures, and sign out only on a terminal error code. A corrupt persisted blob reads as signed out.

Lives in `src/admin/*.ts`, `src/admin/*.tsx`, `src/admin/admin.css`.

## Analytics boot order

The analytics sink mounts before the launch beat so it is already listening on the bus; sibling effects run in render order. Both sit at the top of the tree for the page's whole life.

Lives in `src/boot-analytics.tsx`.

## Store app association

Only the home route opens the store app. Plan links stay on the web because the store app cannot sell plans. Checkout return hands off to the desktop app once per page load.

Lives in `src/app-association.ts`, `src/checkout-return.tsx`.

## Playwright harness

Two serve modes: `dev` (Vite dev servers, every local run) and `bundle` (prebuilt output behind `vite preview`, CI default). Bundles are development-mode builds on purpose so `import.meta.env.DEV` branches, React dev warnings and dev-only test hooks stay. The two servers differ only in the baked Firebase key (identity off for the suite, identity on for sign-in specs). Bundles carry a commit stamp and a local run warns when serving a stale build; a missing bundle fails at server start, not at config load, because `playwright test --list` runs with nothing built.

Resolved ports are pinned into the environment before workers spawn and passed explicitly to child processes so nothing re-derives them differently.

One Playwright suite per machine: a suite saturates the box (N workers times a full Chromium), so two at once starve each other into timeouts. The lock wraps the whole `playwright test` process because webServers boot before globalSetup; a timed-out waiter releases only its own lock.

Global setup warms each server through to the shell (and through sign-in on the identity-on server), because Playwright only waits for the port and Vite compiles on demand, and dep-optimizer caches are per port. `goto` gets the same generous ceiling as the warm-up.

No retries, CI included: a retry only re-ran a failure that `--fail-on-flaky-tests` already failed. Trace and video are on for every attempt because first-attempt failures were otherwise undiagnosable.

CI runners have 4 vCPUs: three workers per shard against the prebuilt bundle.

Each worker runs its own in-process fake host. Pages are reset to the fake seed and primed with a boot seed through `addInitScript`, which runs before page scripts on every navigation; English is forced so label selectors are stable.

The visual project runs only via `test:visual`, Chromium only (baselines are Chromium renders), with CSS animations, transitions, caret and JS-driven motion frozen.

A WebKit config runs the e2e suite on the engine the desktop's WKWebView uses.

The phone project uses Pixel 7 against the same identity-off server.

The harness signs in with an unsigned but structurally real Firebase ID token: the client only decodes `sub`, `email` and `exp`; the gateway verifies signatures. OTP verification is mocked.

Playwright's ESM loader refuses JSON imports without `type: json`, and the domain barrel reaches such imports, so harness modules import domain by subpath.

Lives in `packages/web/playwright.config.ts`, `playwright.webkit.config.ts`, `e2e/support/*.ts`, `e2e/config.ts`, `tests/e2e-harness-loads.test.ts`.

## Wire specs pin bytes

The `wire-*.test.ts` specs pin what the web adapter puts on the wire byte for byte (URL, method, body and the headers the gateway routes on), because the control-plane copies they replaced are gone and these are the only proof the client and gateway agree.

Lives in `packages/web/tests/support/wire-capture.ts`, `tests/wire-*.test.ts`.

## Browser quirks the tests guard

Browser page translation (Chrome, Safari, extensions) wraps text nodes in `<font>`, and React's next commit throws from `removeChild` or `insertBefore`; the app must survive it.

Safari, Firefox and Chrome's strict popup setting refuse `window.open` after an async hop, so OAuth tabs are reserved inside the click and pointed at the URL later.

System WebKit on macOS 10.15 (Safari 15) has no `AbortSignal.timeout`.

iOS ignores manifest icons and reads only the apple touch icon.

Headless Chromium names blob downloads with a GUID, so download tests assert bytes.

A styled scrollbar takes layout width, so board columns reserve a gutter to keep card widths stable.

Lives in `e2e/page-translation.spec.ts`, `e2e/integrations-popup-blocked.spec.ts`, `tests/provider-statuses-batch.test.ts`, `tests/pwa-manifest.test.ts`, `e2e/files.spec.ts`, `e2e/board-card-scroll.spec.ts`.
