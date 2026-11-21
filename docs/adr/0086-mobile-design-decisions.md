# Mobile shell: design decisions

Covers `packages/mobile/`: the Capacitor iOS and Android shell around the web build, its native dependency policy, fingerprint and live updates.

## No analytics or ad SDKs in native builds

The native apps link no Facebook SDK and no analytics or ad-measurement SDK, because App Store privacy labels, App Tracking Transparency and Play data-safety answers depend on their absence. FirebaseCore and Firebase Messaging still carry Google's analytics interop interfaces, which are allowed. The policy check resolves SwiftPM traits as the generated CapApp-SPM manifest passes them (the generated manifest is what Xcode builds, so a stale one means `sync` has not run), and on Android counts a dependency inside `if (flag)` unless `variables.gradle` sets that flag explicitly; a flag left to the plugin's default fails closed.

Lives in `packages/mobile/scripts/native-dependency-policy.ts`.

## Native fingerprint and store builds

The fingerprint hashes everything a store build bakes in (locked native plugin versions, `capacitor.config.ts`, Info.plist, entitlements, app delegates, AndroidManifest.xml, MainActivity, Android XML resources), with line endings normalized. The compatibility table appends an entry per fingerprint, never edits one. Local builds, including the first hand-uploaded Play bundle, sit one below the first CI store build so they never reuse its versionCode. `capacitor.config.ts` is excluded from comment sweeps because any edit moves the OTA floor.

Lives in `packages/mobile/scripts/native-fingerprint.ts`, `src/native-compat.test.ts`.

## OTA sequences are per native build

The highest applied OTA sequence is recorded per native build, because a store upgrade restarts from that build's own builtin bundle; an older build's record must not hide OTAs newer than the new builtin. The store bundle records its native baseline before any OTA code runs. Builds that predate per-build sequences kept one `houston.ota.sequence.<channel>` value; it seeds the policy floor once (native requirement 1) and is then removed, so the first check after the update cannot accept an older replay.

Lives in `packages/mobile/src/updates/native-sequence.ts`, `manager.ts`.

## Required-update policy never relaxes

The newest authenticated required-update policy is persisted per channel apart from bundle installs, so a replayed older manifest can never relax a gate. A stale manifest keeps the newer policy. An equal sequence is the same signed publish (sequences are unique per run), so it may raise a policy that was seeded without its native requirement. Corrupt local state is reported and the current manifest reseeds the policy. A fetch failure retries on a later resume.

Lives in `packages/mobile/src/updates/manager.ts`, `policy.ts`.

## Manifest signatures

WebCrypto ECDSA verification expects IEEE P1363 `r||s`, not ASN.1 DER.

Lives in `packages/mobile/src/updates/manifest.ts`.

## Bundle downloads go through native HTTP

GCS path-style object URLs use the XML API, which needs bucket CORS for a WebView fetch. CapacitorHttp uses native networking, so the pinned bucket needs no CORS. Native persists the failed bundle when a rollback happens before the JS listeners exist.

Lives in `packages/mobile/src/updates/boot.ts`.

## Bundle readiness and rollback

The online readiness watch starts before the web entry loads, so a bundle whose entry throws is still caught. A bundle is good once the app has mounted and stayed up without crashing for a set time; any mounted UI counts, the boot splash included, so a slow network or engine wake never rolls back a healthy bundle. Only the crash screen fails. The mount deadline matches Capgo's `appReadyTimeout`. An offline launch only proves the bundle boots, so Capgo is told it is ready (its timeout would otherwise roll back a healthy update) and the bundle is remembered as provisional until an online launch mounts the app; a bundle already confirmed online is never put on trial. Capgo reports "success" after the provisional notify, which still means on trial. The online watch reads the provisional marker only after the offline launch has recorded or skipped it.

Lives in `packages/mobile/src/updates/ready.ts`, `src/main.ts`.

## Shell globals before app modules

`app/src/lib/engine.ts` resolves the gateway endpoint once, at evaluation, and the shell imports app code (updater, boot error reporting) before the web entry publishes the endpoint. The shell publishes its globals first, before analytics bootstrap, or the engine gate waits forever.

Lives in `packages/mobile/src/surface.ts`, `src/main.ts`, `src/boot-order.test.ts`.

## OTA commit guard

An OTA publish is refused for a commit that is not current main code. A `cloud-v*` release commit is never on main: the daily cut commits `release: v<version>` on the main tip and pushes it only under its tag, and hand cuts add notes commits, CI fixes or cherry-picked hotfixes on top. When neither base contains the other because a notes commit reached main only later (one commit apart), the guard passes; a release branch merged back long after its cut is old code and is refused. The guard runs before the build for every non-dispatch publish, only an explicit dispatch raises the sequence (upward only), and a rerun signs the bytes already published under that name. Release commits are off main, so `git describe` would find an old tag.

Lives in `packages/mobile/scripts/ota-commit-guard.sh`, `ota-workflow.test.ts`, `store-url-workflows.test.ts`.

## Sign-in and sign-out

Sign-out clears both the JS session and the native one, since the native Google SDK or Credential Manager and Apple's native Firebase session outlive the JS sign-out and would hand the next sign-in the previous account. A native failure is reported but never fails sign-out, because the JS session is what Houston restores on launch, and a hung native plugin is timed out so it never holds the sign-out screen. Apple's native sheet returns the name only on first consent and the JS credential carries only token and nonce, so the first result is preserved. Apple requires `skipNativeAuth` and the original unhashed nonce Capawesome returns. Microsoft is unavailable because the plugin cannot expose its credential for JS SDK sign-in while `skipNativeAuth` is true (Capawesome firebase-js-sdk.md, Quirks).

Lives in `packages/mobile/src/identity/mobile-identity.ts`, `native-credential.ts`, `availability.ts`.

## Build environment

Local shell builds take only the public Firebase identity values from the repo's `.env.local`. Using that file as Vite's `envDir` would bake unrelated `VITE_*` development tokens into the shipped bundle.

Lives in `packages/mobile/vite.config.ts`.

## Native glue details

URL schemes the OS hands to its own apps (mail, phone, messages) go to the OS; the in-app browser takes only http(s) because SFSafariViewController accepts nothing else. Capacitor's WebView delegates non-web navigations to the OS on both platforms.

System bars start before the online gate so offline launches still have legible bars.

Native resume mirrors TanStack Query's browser focus and online refresh.

Capacitor 8's SystemBars plugin owns the Android keyboard inset; the Keyboard plugin skips `resizeOnFullScreen` when SystemBars is present. iOS resizes natively.

The bundle is local, so airplane mode still renders a first frame.

A file input's "Take Photo or Video" crashes the app unless the camera usage keys are in the native manifests.

Lives in `packages/mobile/src/open-url.ts`, `system-bars.ts`, `app-state.ts`, `keyboard-config.test.ts`, `offline.ts`, `scripts/native-manifests.test.ts`.
