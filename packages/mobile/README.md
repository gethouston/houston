# Houston mobile shell

This Capacitor 8 package wraps the shared `packages/web` build. Its Vite config
reuses the web aliases, defines, React setup, and Tailwind setup; the mobile
entry sets the native surface, deploy environment and gateway host mode before
any app module loads, since the app's engine module reads the gateway endpoint
once when it is evaluated. All product behavior remains in the shared app and
SDK.
`assets/logo.png` is derived from `packages/web/public/icons/houston-512.png`;
the generated icon and splash assets use the light background token.

## Prerequisites

- Node and pnpm from the repository toolchain.
- iOS: Xcode 26 or newer and an installed iOS simulator. The generated project
  uses Swift Package Manager.
- Android: Android Studio, its SDK, and a compatible JDK.

## Environment

`VITE_CONTROL_PLANE_URL` is required. Production uses
`https://gateway.gethouston.ai`. `HOUSTON_MOBILE_DEPLOY_ENV` is `production`
by default; set it to `preview` or `development` for those builds. The WebView
hostname is always `localhost`, so this value is baked during the mobile build.
`FIREBASE_API_KEY` is also required so the cloud sign-in screen can render.

Remote push and native provider sign-in require the Firebase client config for each native app:

- iOS: `packages/mobile/ios/App/App/GoogleService-Info.plist`
- Android: `packages/mobile/android/app/google-services.json`

Commit both files once the Firebase apps are registered. They are public
Firebase client configuration, not secrets. Without the file for the target
platform, the app still builds and boots; remote push and native Google/Apple
sign-in are unavailable, email code sign-in remains available, and a console
breadcrumb names the missing configuration. The iOS build copies its plist into the app
bundle when present. The Firebase project must register bundle ID
`ai.gethouston.app` and package name `ai.gethouston.app`. iOS also needs a
provisioning profile with Push Notifications enabled and APNs credentials in
Firebase; the Xcode target has its push entitlement and remote-notification
background mode. Android declares `POST_NOTIFICATIONS` for API 33 and newer.

## Native sign-in setup

The mobile shell uses `@capacitor-firebase/authentication` with
`skipNativeAuth: true`. Google and Apple supply native provider credentials to
the Firebase JavaScript SDK, which owns the session and email code sign-in.
There is no separate Firebase native session. The web and desktop builds keep
their existing sign-in flows.

1. Register the iOS bundle ID and Android package `ai.gethouston.app` in the
   same Firebase project as the web app. Download their respective config
   files to the paths above, then run `sync`. The files enable push and native
   Google sign-in on that platform; the iOS file also enables Apple when its
   Apple Developer/Firebase setup below is complete.
2. In Firebase Authentication, enable Google. For Android, register the SHA-1
   of each development/release signing certificate and the Google Play App
   Signing certificate. Download an updated `google-services.json` after adding
   fingerprints. The native project includes the plugin's Google and Android
   Credential Manager dependencies.
3. For iOS Google sign-in, `sync` reads `REVERSED_CLIENT_ID` from the plist and
   writes its callback URL scheme into the app's `Info.plist`. The app delegate
   forwards that callback to Firebase Auth and Capacitor. Re-run `sync` after
   replacing the Firebase plist.
4. In Apple Developer, enable Sign in with Apple for `ai.gethouston.app` and
   regenerate the provisioning profile with that capability. The Xcode target
   already has the entitlement. Create a Services ID for Android's browser
   flow, associate it with the app, and register
   `https://gethouston.firebaseapp.com/__/auth/handler` as its Return URL (use
   the actual Firebase project ID if different). Create a Sign in with Apple
   private key and note its Key ID and Apple Team ID. In Firebase Authentication,
   enable Apple and enter the Services ID, Team ID, Key ID and private key.
   Supply the public Services ID as `FIREBASE_APPLE_SERVICE_ID` for Android's
   browser flow. iOS offers native Apple whenever its Firebase config enables
   Google; the Services ID is not an iOS availability gate.
   Apple on Android opens the Firebase browser flow, while iOS uses the native
   Apple authorization sheet. Both require `skipNativeAuth` and return the raw
   nonce for the JavaScript credential.

Microsoft is hidden in the native apps. Capawesome's Firebase JavaScript SDK
guide states its Microsoft flow cannot be bridged with `skipNativeAuth`; the
result cannot establish the JavaScript session used by Houston. Supporting it
requires a system-browser Microsoft OAuth flow and a gateway exchange to a
Firebase custom token, then the existing JavaScript `signInWithCustomToken`
path. Native Microsoft needs that backend flow before a button can be offered.

For a release build, provide the same public identity and telemetry values as
the cloud web build: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
`FIREBASE_PROJECT_ID`, `POSTHOG_KEY`, `POSTHOG_HOST`, and `SENTRY_DSN`.
Local builds also read the public `FIREBASE_*` values from the repository's
`.env.local` when those variables are not exported. No other values from that
file enter the mobile bundle.
`VITE_AGENTSTORE_GATEWAY_URL` and `VITE_CLIENT_METRICS_GATEWAY_URL` can target
the gateway independently when needed. Do not put credentials in native source.

## Native dependency policy

The apps link no Facebook SDK and no analytics or ad-measurement SDK (Firebase
Analytics, GoogleAppMeasurement, Google Ads on-device conversion). The App
Store privacy labels and the Play data-safety form depend on it. The Firebase
authentication plugin includes provider SDKs by default, so the provider set is
pinned in configuration that survives `sync`:

- iOS: `capacitor.config.ts` sets the plugin's SwiftPM package trait to
  `Google` (with `swiftToolsVersion` 6.1, which traits require). `sync` writes
  it into `ios/App/CapApp-SPM/Package.swift`. SwiftPM still lists
  `facebook-ios-sdk`, `googleappmeasurement` and the ads package in
  `Package.resolved`, since resolution covers every declared package; none of
  them is built or linked.
- Android: `android/variables.gradle` sets `rgcfaIncludeGoogle = true` and
  `rgcfaIncludeFacebook = false`.

`scripts/native-dependency-policy.test.ts` fails when any installed plugin
would link a banned SDK under the configured traits or Gradle flags, when the
generated `Package.swift` is stale, or when the Xcode target links a package
product other than `CapApp-SPM`. FirebaseCore and Messaging keep Google's
analytics interop interfaces (`FIRAnalyticsInterop`,
`firebase-measurement-connector`); they contain no measurement code. After
changing native plugins, confirm the built app: `App.app/Frameworks` holds only
`Capacitor` and `Cordova`, and
`./gradlew :app:dependencies --configuration releaseRuntimeClasspath` lists no
`com.facebook`, `firebase-analytics` or `play-services-measurement` artifact.

## Build and run

From the repository root:

```sh
VITE_CONTROL_PLANE_URL=https://gateway.gethouston.ai pnpm --filter houston-mobile sync
pnpm --filter houston-mobile ios
pnpm --filter houston-mobile run:ios
pnpm --filter houston-mobile android
```

`sync` builds the mobile entry into `packages/mobile/dist`, then copies it to
both native projects and updates native plugins. `ios` and `android` open the
generated projects in their IDEs. `run:ios` runs on an available simulator.
To build in Xcode directly, open `packages/mobile/ios/App/App.xcodeproj` and
select an iOS simulator. Android Studio opens `packages/mobile/android`;
build or run the `app` target there after `sync`.

## Over-the-air updates

The native updater runs in manual mode. A mobile build enables OTA when both
`HOUSTON_MOBILE_UPDATE_BASE_URL` and `HOUSTON_MOBILE_UPDATE_PUBKEY` are present.
The first is the public HTTPS object base (production:
`https://storage.googleapis.com/houston-mobile-updates`); the second is the
base64 DER SPKI ECDSA P-256 public key. A missing value prints one named `OTA
OFF` boot breadcrumb. `HOUSTON_MOBILE_DEPLOY_ENV` selects `preview` or
`production`. `HOUSTON_MOBILE_STORE_URL_IOS` and
`HOUSTON_MOBILE_STORE_URL_ANDROID` supply optional store links on a mandatory
native update screen. Without a URL, the gate stays open and its Check again
button re-fetches the signed manifest.
An unset deploy environment defaults to `development`; production and preview
builds name their channel explicitly.

The mobile Vite build writes `dist/version.json` with
`<root package semver>+<git short sha>` and embeds the same version in the app.
It also copies `native-compat.json` into the bundle. A change to native code or
the Capacitor plugin dependencies requires a new iOS `CURRENT_PROJECT_VERSION`
and Android `versionCode` and an update to `native-compat.json`'s
`min_native_build` and `required_native_build`. The plugin dependency fingerprint
test pins both the native build and dependency fingerprint, so updating the
plugin set requires advancing that test baseline with the native build. Set
`min_native_build` to the first native build capable of running the bundle;
set `required_native_build` to the first build allowed to keep using the app.
CI bakes `HOUSTON_MOBILE_BUILTIN_SEQUENCE` into each native or OTA bundle as
`github.run_id * 100 + github.run_attempt`; local builds use zero. Attempts
stay below 100. The run ID increases between runs across both mobile workflows.
The store bundle records its baked sequence locally per channel and native build
on first boot. OTA bundles keep that native baseline when they replace JavaScript,
and each store upgrade seeds its newer floor, so a newer publish can
roll back to an older OTA zip that still postdates the installed store bundle.

On each main push, `.github/workflows/mobile-updates.yml` builds the preview
bundle with the staging gateway. On release publication, it builds the
production bundle with the production gateway. Both jobs zip `dist`, hash the
zip with SHA-256, sign canonical JSON with a PKCS8 PEM ECDSA P-256 key, upload
`<channel>/<version>.zip`, then upload `<channel>/manifest.json` last with
`Cache-Control: no-store`. The signature uses IEEE P1363 `r||s` bytes so
WebCrypto can verify it. The manifest request uses CapacitorHttp native networking, since GCS path-style
object URLs require bucket CORS for browser fetch. Each native launch and
eligible resume checks the signed manifest and queues a compatible bundle for the next launch or
background transition. The updater rolls back a bundle that does not report
ready within 30 seconds. The first committed app shell, including its loading
view, reports ready, so a slow network does not roll back a healthy bundle.
The signed manifest includes its channel, increasing publish `sequence`, and
the zip's original `bundle_sequence` from `version.json`. The app
rejects another channel, a sequence at or below the highest locally accepted
sequence, a publish sequence at or below its built-in sequence, and any zip
whose original bundle sequence is below that built-in sequence. It persists the
highest accepted sequence per channel. A rollback reuses an old zip but signs a
new manifest with the current run's higher sequence.
The publish workflow compares the new sequence with the channel's current
manifest and refuses a rerun that would lower it.

CI uses the existing `github-deploy-web` Workload Identity Federation identity
and needs repository secrets `HOUSTON_MOBILE_UPDATE_SIGNING_KEY` (PKCS8 PEM) and
`HOUSTON_MOBILE_UPDATE_PUBKEY` (matching base64 DER SPKI). Existing web build
secrets supply Firebase, gateway, PostHog and Sentry values. The repository
variable `FIREBASE_APPLE_SERVICE_ID` supplies Android Apple availability in OTA bundles.
Repository variables `HOUSTON_MOBILE_STORE_URL_IOS` and
`HOUSTON_MOBILE_STORE_URL_ANDROID` fill the store buttons when set. Production
OTA builds permit them to be absent; each store release job skips with one named
notice when its platform URL is absent. To roll back, run
the workflow manually with the channel and an existing bundle version. It
retrieves that archive, reads its recorded version and compatibility floor,
signs a fresh manifest for the same archive, and replaces only the manifest.

Push registration is scoped to the current signed-in user. A gateway
`409 {"code":"device_conflict"}` makes the client persist a new installation ID
and retry registration once. The gateway transfers another user's row only
when the FCM token matches, clearing the previous user's pending outbox in the
same transaction. A cross-user device ID with a different token
returns that 409 without changing a row.
A turn-settled push names up to 512 explicit user
IDs in mission order; overflow is reported as an error and never broadens the
audience to everyone.

## Release

`.github/workflows/mobile-release.yml` publishes the production iOS and Android
apps on a release tag or manual `main` dispatch. Missing credentials produce one
named notice per platform. See `store/release.md` for setup and build numbers.

- Apple secrets: `IOS_GOOGLE_SERVICE_INFO_PLIST_B64` (Firebase iOS config), `ASC_KEY_P8_B64`, `ASC_KEY_ID`, `ASC_ISSUER_ID` (App Store Connect API key).
- Android secrets: `ANDROID_GOOGLE_SERVICES_JSON_B64` (Firebase Android config), `ANDROID_UPLOAD_KEYSTORE_B64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD` (local upload key), `PLAY_SERVICE_ACCOUNT_JSON` (Play release service account).
- Shared secrets: `HOSTED_ENGINE_URL`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `POSTHOG_KEY`, `POSTHOG_HOST`, `SENTRY_DSN` (existing production web values), `HOUSTON_MOBILE_UPDATE_PUBKEY` (OTA public key).
- Variables: `APPLE_TEAM_ID`, `HOUSTON_APPLE_TEAM_ID` (Apple Developer Team ID), `HOUSTON_ANDROID_CERT_SHA256` (Play App Signing fingerprint), `FIREBASE_APPLE_SERVICE_ID` (Firebase Apple provider), `HOUSTON_MOBILE_STORE_URL_IOS`, `HOUSTON_MOBILE_STORE_URL_ANDROID` (store listing links).
