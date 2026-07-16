# Houston for iOS

Native SwiftUI app (iOS 17+, Swift 5.9, zero third-party packages). It is a thin
surface over [`@houston/sdk`](../../packages/sdk): the SDK runs inside
JavaScriptCore as an embedded bundle and the app talks to it through a single
`SdkClient` facade. The wire contract between the two is
[`packages/sdk/BRIDGE.md`](../../packages/sdk/BRIDGE.md). UI/copy/status parity
with desktop is governed by [`../PARITY.md`](../PARITY.md).

The Xcode project is **not committed** — it is generated from `project.yml` by
[XcodeGen](https://github.com/yonaskolb/XcodeGen). The spec is the source of
truth; regenerate whenever `project.yml` or the file layout changes.

## Bring-up

```sh
# 1. Tooling (once)
brew install xcodegen

# 2. Install JS deps + build the SDK bundle & design tokens (from the repo root).
#    The design-tokens `prepare` hook emits the SwiftUI tokens on install; the
#    SDK bridge bundle is (re)built by the Xcode build phase, but building it
#    here first makes the first `xcodegen generate` pick up the resource.
cd ../..                       # repo root
pnpm install
pnpm --filter @houston/sdk build:bridge
pnpm --filter @houston/design-tokens build

# 3. Generate and open the Xcode project.
cd mobile/ios
xcodegen generate
open Houston.xcodeproj

# 4. In Xcode: select the Houston target → Signing & Capabilities → pick your
#    Team (DEVELOPMENT_TEAM is intentionally blank in project.yml).

# 5. Plug in an iPhone with Developer Mode enabled
#    (Settings → Privacy & Security → Developer Mode), select it, and Run.
```

`Houston/App/Config.swift` ships the production GCIP (Firebase Auth) API key
and project id (public by design — access is gated by provider config and the
gateway allowlist, exactly as the desktop bakes them). Two constants are left
empty for you to paste after the one-time registrations: the Google **iOS**
OAuth client id and the Microsoft Entra app (client) id — until then those two
buttons surface a clear "not available yet" error; Apple and the email code
work without them. Point the constants at your own Firebase project only if
you run your own gateway.

## Layout

```
mobile/ios/
  project.yml              XcodeGen spec (targets, Info.plist, build phases)
  Houston/
    App/                   @main app, config, root routing, tab shell
    Core/Runtime/          JavaScriptCore host (JSRuntime + polyfills)
    Core/Bridge/           SdkClient facade, Codable models, transport + native ports
    Core/Auth/             GCIP (Firebase) auth: 4 sign-in flows + SignInView
    DesignSystem/          tokens wrapper, Strings, shared styles
    Features/              Agents, AgentMissions, Chat, MissionControl, NewMission,
                           Settings, AIModels, Integrations
    Assets.xcassets/       app icon (single-size 1024, flattened from the brand mark)
    Localizable.xcstrings  en/es/pt String Catalog (see Localization below)
    Generated/             built at build time (gitignored): SDK bundle + tokens
  HoustonTests/            unit tests
  scripts/                 build-phase shell scripts
```

### Startup wiring

On launch `HoustonApp.bootstrap()` calls `SdkBootstrap.attach()`
(`Core/Bridge/SdkBootstrap.swift`) **before** `SdkClient.shared.start(...)`.
`SdkBootstrap` builds one `JSRuntime` and wires it into the facade:

- `JSRuntimeTransport` adapts `JSRuntime` to `SdkBridgeTransport` — it boots the
  bundle and hops the engine's `onSend` (JS queue) to the main actor in FIFO
  send order (BRIDGE.md §8).
- `SdkPortRouter` services native `fetch/*` / `storage/*` requests over the same
  runtime; it is attached as the client's `portHandler`.

`SdkClient` retains the transport, and the `router.handle` method reference
retains the router, so the stack lives for the app's lifetime. Without this
attach, `start(...)` throws `SdkClientError.noTransport` and the app shows the
startup-error screen (never a blank screen). The app-wide cross-agent
aggregation (`AgentsOverviewModel`) and the chat-destination builder are
injected once at the root via `\.agentsOverview` / `\.chatViewBuilder`.

### Build phases (run before compile, incremental)

Both live in `scripts/` and are invoked by pre-build script phases declared in
`project.yml`. Each phase has input/output file lists, so Xcode skips it on
incremental builds when nothing changed.

1. **Build SDK bundle** (`scripts/build-sdk-bundle.sh`) — runs
   `pnpm --filter @houston/sdk build:bridge` at the repo root and copies
   `packages/sdk/dist/houston-sdk.bridge.js` into `Houston/Generated/`, where it
   is bundled as the app resource `houston-sdk.bridge.js`.
2. **Sync design tokens** (`scripts/sync-design-tokens.sh`) — copies
   `packages/design-tokens/dist/swift/HoustonTokens.swift` into
   `Houston/Generated/`; the DesignSystem code imports it as a compiled source.

## Localization

The app ships **en / es / pt**, following the iOS system (or per-app) language.
All user-facing copy flows through the `Strings` enum (`Strings*.swift`, one file
per surface); each member is a `String(localized: "<key>", defaultValue: "<en>")`
lookup against `Houston/Localizable.xcstrings`. Keys mirror the Swift keypath
(`Strings.Board.columnRunning` → `board.columnRunning`). The en copy mirrors the
desktop locale files exactly (PARITY is law); where a desktop key exists, es/pt
reuse the desktop translations verbatim. Plurals use catalog plural variations —
never `count == 1` branches in Swift. Adding a string = add the `Strings` member
AND the catalog entry with all three languages in the same change. Full
conventions: `knowledge-base/i18n.md` (iOS section).

## Troubleshooting

- **`pnpm: command not found` in a build phase.** Xcode run scripts get a
  minimal `PATH` (no Homebrew / nvm / corepack). `scripts/lib.sh` repairs it by
  prepending `/opt/homebrew/bin`, `/usr/local/bin`, `~/Library/pnpm`, and nvm
  node dirs. If pnpm lives elsewhere, add its directory there. The phase fails
  loudly rather than silently skipping.
- **`Generated/` file not found on first build.** The pre-build phases create
  it. If Xcode complains the source is missing, do a clean build (Product →
  Clean Build Folder) so the phases run before compilation.
- **Changed the SDK or tokens but the app didn't pick it up.** The build phases
  key off the built `dist/` artifacts. Rebuild them explicitly
  (`pnpm --filter @houston/sdk build:bridge`,
  `pnpm --filter @houston/design-tokens build`) then build the app, or clean the
  build folder to force the phases to re-run.
- **Signing errors.** `DEVELOPMENT_TEAM` is blank in `project.yml`; set your
  team on the target in Xcode (or export `DEVELOPMENT_TEAM` before
  `xcodegen generate`).
- **Browser sheet never returns after Google/Microsoft sign-in.** Google's
  callback scheme is the reversed client id derived from
  `Config.googleIOSClientID` (no Info.plist entry needed —
  `ASWebAuthenticationSession` intercepts it); Microsoft redirects to
  `houston://auth-callback`, which must stay in `project.yml`'s
  `CFBundleURLTypes` AND in the Azure app registration's mobile redirect URIs.
- **Sign in with Apple fails with a nonce/config error.** The `apple.com`
  provider must be enabled in GCIP (terraform: `cloud/infra/terraform/identity.tf`)
  and the App ID needs the Sign in with Apple capability; the entitlement is
  already declared in `Houston/Houston.entitlements`.
