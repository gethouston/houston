# Build and release scripts: design decisions

Covers the build and release scripts: `scripts/build-*.sh`, `scripts/smoke-sidecar-browser.sh`, `scripts/version.sh`, the DMG scripts, the generators under `scripts/`, `scripts/publish-starter-agents.mjs`, `scripts/linear-release-stamp.mjs`, `scripts/event-qr.sh`, `selfhost/bundle.mjs`, `app/vite.config.ts`, `app/scripts/` and `app/public/compat-gate.js`.

## Host sidecar build (`scripts/build-host-sidecar.sh`)

One binary, several roles: the compiled `packages/host/src/sidecar-entry.ts` runs as the local host by default and as a pi runtime when `HOUSTON_SIDECAR_ROLE=runtime`. The host spawns itself in runtime mode, so the packaged app needs no `bun` and no repo source (a source-run default could never resolve inside the .app).

Output is named by Rust triple (`target/host-sidecar/houston-host-<triple>`), matching Tauri's externalBin suffix so `build.rs` can stage it as `binaries/houston-engine-<triple>` without touching `tauri.conf.json`. Bun links its own libc, so same-OS cross-arch builds work (the macOS universal build compiles both arches on one runner); `--verify` only applies to a host-native target.

`--sourcemap` embeds the map in the binary so stack traces and Sentry events point at TS sources with no upload. `chromium-bidi` is excluded: playwright-core requires it only for Firefox WebDriver BiDi, which the browser tool never launches, and bun cannot resolve those optional requires at compile time.

A `<binary>.stamp` with the git HEAD sits next to each binary (per triple) for the release freshness check in `build.rs`.

The SDK's native `claude` binary cannot be resolved from inside Bun's `$bunfs`, so it ships as a sibling externalBin (`binaries/claude-<triple>`) that the macOS signing sweep signs like any other; `resolveClaudeExecutable()` points the SDK at it. It comes from the per-platform optional package `@anthropic-ai/claude-agent-sdk-<os>-<arch>` (glibc on Linux). pnpm installs only the host platform's package, so cross-target builds must force-install the other one first. Newest match in the store wins.

`--verify` boots the binary, waits up to 20 s for the banner, checks `/v1/capabilities` reports the local profile, checks `/v1/catalog` returns a non-empty JSON array (a stale host 404s there, which once shipped an empty model picker), and checks the boot line for the embedded assistant catalog, because a build that lost it boots fine and only fails on installed machines.

## Browser smoke test (`scripts/smoke-sidecar-browser.sh`)

`bun build --compile` bakes the build machine's paths into dynamic requires; playwright-core loads its `package.json` and `browsers.json` that way, so packaged apps failed on every user's first browser call. `patches/playwright-core@*` makes those static; this script proves it by running the compiled binary from a temp dir outside the checkout with `HOUSTON_SIDECAR_ROLE=browser-probe`.

## whisper-cli build (`scripts/build-whisper.sh`)

The pinned whisper.cpp tarball is SHA256-verified (`WHISPER_SHA256` must be updated with `WHISPER_VERSION`). The binary is fully static (`BUILD_SHARED_LIBS=OFF`, no OpenMP) and on macOS embeds Metal (`GGML_METAL_EMBED_LIBRARY=ON`), so there is no dylib or `.metallib` to ship. The macOS deployment target matches `tauri.conf.json` `minimumSystemVersion` (10.15).

macOS: BLAS is off because Accelerate's ILP64 cblas entry points are weak-linked and available only from macOS 13.3, which would crash on the 10.15 floor. `GGML_NATIVE=OFF` keeps the shipped binary portable and avoids `-mcpu=apple-m<N>` flags that an older clang on a newer runner rejects (the build broke when runners moved to M3). Non-host arches are cross-built with `CMAKE_OSX_ARCHITECTURES`.

x86-64 Linux and Windows: `GGML_NATIVE=OFF` stops `-march=native` but ggml then enables the SSE4.2/AVX/AVX2/BMI2/FMA/F16C family, requiring a Haswell-era CPU. That baseline is deliberate (AVX2 is a large speedup and the CPU path is the only path there), so the flags are pinned explicitly to stop a whisper.cpp bump from raising it, and must match the pre-flight gate in `app/src-tauri/src/dictation/cpu.rs`.

Windows: the MSVC runtime is linked statically (`CMAKE_MSVC_RUNTIME_LIBRARY` with policy CMP0091 forced NEW, since whisper.cpp's minimum CMake predates 3.15) so machines without the VC++ redistributable can run it. ARM64 uses Visual Studio's ClangCL toolset because ggml refuses plain MSVC for ARM (its kernels need clang's NEON intrinsics) while keeping the MSVC ABI and linker.

Linux and Windows build natively per arch; a requested arch that does not match the host is rejected. On Windows-on-ARM runners Git Bash is an emulated x86_64 build and `uname -m` lies, so the host arch comes from `RUNNER_ARCH`, then `PROCESSOR_ARCHITEW6432`, then `PROCESSOR_ARCHITECTURE`, then `uname -m`.

Post-build gates: on macOS `otool -L` must show only `/usr/lib` and `/System/Library` dependencies; on Windows a grep of the PE import table must find no VC++ runtime DLLs (dumpbin needs a VS dev shell). Visual Studio generators put the binary under `build/bin/Release/`.

## Version bump (`scripts/version.sh`)

Must produce byte-identical LF-only output on macOS, Linux and Windows git-bash. No `jq` (the Windows build emits CRLF and reserializes the whole file) and no `sed -i ''` (GNU sed reads `''` as the script and aborts under `set -e`); `perl -i -pe` rewrites single lines and preserves line endings everywhere. Semver is validated first, which also makes the unquoted interpolations inside the perl programs safe. Only the top-level `version` key of each package on the shared version line is rewritten (the first hit per file); `ui/agent`, `ui/agent-schemas` and `packages/wire-types` are versioned independently. In `app/src-tauri/Cargo.toml` only the `[package]` version and houston `path =` dependency pins change (a caret pin tolerates patch bumps and then breaks on the first minor bump). The root `Cargo.toml` bumps only `path =` dependencies. `cargo update --workspace` regenerates the lock, because a toml/lock mismatch fails the release build.

## DMG scripts

`rename-dmg-volume.sh`: Tauri's bundler hardcodes the volume name to `productName`, which makes the mounted disk look like the app itself; the release volume is renamed to "Houston Installer" by converting to a sparse image, renaming with `diskutil`, and converting back to UDZO. The rename invalidates the signature, so CI re-signs, notarizes and staples afterwards. The device node from `hdiutil attach` is used to detach, because a renamed volume may move to `/Volumes/<new-name>` and the original mountpoint goes stale. Detach happens before removing the temp dir (the reverse produced "Resource busy" failures), and detach is retried because a freshly renamed volume can briefly report busy. Dot-prefixed helper folders get the hidden flag before the rename.

`build-dmg-local.sh` re-packages an existing `.app` into a styled DMG in seconds for visual iteration. Layout values must match `tauri.conf.json` `bundle.macOS.dmg`. The Finder window is 40 px taller than the 440 px background because Finder bounds include the title bar. The disk must mount under `/Volumes/<name>` for Finder's AppleScript to find it, and it goes through mount plus osascript (not `hdiutil makehybrid`) so icon positions can be written to `.DS_Store`. `.background` and `.fseventsd` are hidden (and re-hidden after mount, since some macOS versions reset the flag), and the script syncs before detaching so Finder flushes `.DS_Store`.

## Frontend build config (`app/vite.config.ts`, `app/scripts/sentry-inject.mjs`)

Env values come from the shell (CI secrets) or `app/.env.local`.

Desktop resolves the Firebase Auth surface to a stub so firebase-js-sdk never ships to desktop; the web bundle points the same specifier at the real module (`packages/web/vite.config.ts`).

The Firebase web config values are public, so baking them is fine. The Google desktop OAuth client secret is also non-confidential (Google treats installed-app secrets as public) and is required in the token exchange, which the TS side owns (`google-authorize.ts`) so the Rust loopback stays a plain listener; it is baked from build env, never committed. The Microsoft desktop client is public with no secret.

`__SENTRY_SEND_IN_DEV__` mirrors the native opt-in: dev builds suppress Sentry unless set (`lib/sentry-dev.ts`).

`sourcemap: "hidden"` emits maps without the `sourceMappingURL` comment so users cannot reconstruct source in DevTools; only the release CI step uploads them, tagged `houston-app@<version>` to match the runtime release.

Workspace packages are excluded from Vite's dependency pre-bundling so live edits are picked up without stale caches.

`sentry-inject.mjs` runs at the end of Tauri's `beforeBuildCommand`, after vite and before cargo embeds `frontendDist`. Injecting after bundling (the old CI order) shifted offsets so shipped JS no longer matched the uploaded map and no frame symbolicated. Injecting here keeps bundle and map byte-identical and bakes the Debug ID into the shipped JS. It is a no-op without a baked `SENTRY_DSN`, is local-only (the upload stays in release.yml), and fails the build on error.

## App test runner (`app/scripts/run-tests.mjs`, `run-shared-tests.mjs`)

All `tests/*.test.ts` run in one node process except those in `tests/own-process.txt`; a process per file took 80 s locally and 142 s on CI, almost all node plus tsx boot. Files run in a seeded random order (printed; `HOUSTON_TEST_SEED` reproduces it) so no test relies on state from an earlier file. Explicit file arguments run one process each. Exit codes go through `process.exitCode`, never `process.exit()`, because stdout to a pipe is asynchronous and exiting truncated CI logs at 64 KB. One shared process plus three isolated workers fits CI's four CPUs. The shared runner uses the `node:test` API rather than the CLI because the CLI sorts file arguments.

## Compatibility gate (`app/public/compat-gate.js`)

Loaded as a classic `<script defer>` in `<head>`, so it runs after `#root` exists and before the deferred app bundle; a parser-blocking script would find no `#root`. It lives in `public/` so Vite copies it verbatim, and it is written in conservative ES2015 because it is never transpiled. Two jobs: (1) detect WebKit older than 16.4 (common on macOS Monterey), which lacks regex lookbehind; the markdown stack has a top-level lookbehind literal that throws while evaluating the bundle, leaving a white screen with no error boundary. The probe uses the `RegExp` constructor so this file still parses on those engines, and paints a localized update-macOS message with inline styles only. (2) On modern engines, capture `error` and `unhandledrejection` (capture phase) and run an 8 s mount watchdog; if `#root` is still empty, paint a localized "couldn't start" screen with plain-text diagnostics and a Copy button. Strings mirror en, es and pt in product voice (no engine names, no em dashes) because i18next is not loaded yet. Pure helpers are exported when `module` exists so the unit test can load the file in Node.

## Generators

`gen-agent-templates.mjs`: bakes the first-party agents under `store/agents/<id>/` into the New Agent picker (`app/src/agents/builtin/store-catalog.ts` plus lazily loaded `store-templates/<id>.json` and per-locale `<id>.<lang>.json`), handed to the host through the existing `seeds` create contract. Translated sources keep English slug tokens; this script is the single place they are rewritten (kebab-boundary matching, longest first) across skill bodies, CLAUDE.md, data-schema.md and manifest seeds, using `store/skills-i18n.json` as the source of truth, and it emits a `skillRenames` map and a light slug index for the app's locale migration. The JSON payloads are Biome-ignored.

`generate-model-catalog.mjs`: a trimmed, deterministic snapshot of models.dev for the AI Hub, keeping only routable providers (OpenCode Go folds into `opencode`). `normalizeKey` has a runtime twin in `app/src/lib/ai-hub/catalog-key.ts` that must stay in sync. Before a name becomes a key it drops parenthetical and bracketed suffixes and a trailing "latest", and strips leading noise tokens (`LEAD_NOISE`): deployment regions (Bedrock's `au`, `eu`, `us`, `apac`, `global`) and vendor echoes (OpenRouter's "Anthropic Claude ...", Bedrock's "AU Anthropic Claude ..."). Trailing model words are never stripped, so the same model folds into one entry across providers without merging distinct models. The timestamp is a content hash so reruns are byte-identical, and each model serializes on one line for readable diffs.

`gen-manychat-openapi.mjs`: a committed copy of ManyChat's Page API spec, because the live document names every operation by an MD5 hash with an empty summary. Schemas stay verbatim; operation ids become the path's last segment, every operation needs an authored summary (a missing one fails the run), the empty `servers` entry becomes the real host, and `sendContent.data` (declared as an empty closed object that would reject every message) is opened. Cleaning is idempotent over its own output.

`generate-team-icons.mjs`: emitted icon bodies reach `dangerouslySetInnerHTML`, so only allowlisted SVG elements and attributes are accepted, checked on the final markup after the fill strip. Names are captured including `:` so namespaced names such as `xlink:href` or `<svg:script>` are judged as written and rejected (nothing on the allowlists has a colon). `team-icon-tags.mjs` holds the search vocabulary separately; the first matching rule also decides the icon's shelf.

## Starter agent publishing (`scripts/publish-starter-agents.mjs`, `scripts/lib/starter-agent-ir.mjs`)

Every starter IR is built and validated with `agentIrSchema` before any network call, through the store's own `normalizeAgentIr` pipeline so the mapping cannot diverge from ingest rules. The category remap is keyed by agent id and an unmapped agent is a hard error. Existing listings are matched by `slugify(name)`, not by the gateway's share slug, which is globally unique (may be suffixed) and null before publish; either would cause a duplicate POST. The script registers tsx's ESM loader so plain node can import the TS agentstore packages.

## Release stamp (`scripts/linear-release-stamp.mjs`, `scripts/lib/release-*.mjs`)

Draft mode runs on the `cloud-v*` tag push (Actions never fires on draft-release creation) and labels the train: issues resolved by the train's PRs plus every issue in App Review at cut time (merged, awaiting verification). Release labels are an exclusive group, so a stale label from an unshipped train is swapped. Publish mode moves label carriers still in App Review (and magic-word issues from any open state) to Released, comments the release link and appends changelogs, guarded by a marker. Post-cut merges lack the label and wait for the next train. The script is an observer: it exits 0 on failure so a tracker outage never blocks a cut or ship, and both modes are idempotent. The train is everything since the previous published `cloud-v*` release (prereleases count; cloud releases are deliberately prerelease), so an unshipped draft rolls forward. PR numbers come from both squash (`title (#123)`) and merge-commit subjects. Only magic words resolve an issue; a bare mention must not release it. The compare API's 250-commit cap is far above a daily train.

## Self-host bundle (`selfhost/bundle.mjs`)

Everything is inlined except what cannot live in the bundle, because a worker VM spent 7 to 10 s of a roughly 15 s boot in Node module resolution over the guest filesystem; one file evaluates in about 0.3 s. External: `@anthropic-ai/claude-agent-sdk` (spawns `claude` from its package directory), `@silvia-odwyer/photon-node` (finds its wasm via `__dirname`; bundled, image reads silently degrade), `@earendil-works/pi-coding-agent` (runtime-computed relative imports for provider chunks), `playwright-core` (reads its own `package.json` via `__dirname`, optional chromium-bidi requires, browsers located relative to the package), and `*.node` addons. A self-check asserts the deliberate externals survive as import specifiers in the runtime bundle (photon is no longer asserted because only the external pi imports it). Maps are external and mappings-only (`sourcesContent: false`): Node parses and keeps the whole map, and inlined sources were 21 to 26 MB of each map, about 100 MB resident per engine process. The Sentry reporter (`packages/runtime-client/src/sentry/frames.ts`) reads source context from the `packages/*` files the images copy beside the bundles; a check fails the build if sources reappear in a map.

## Event QR codes (`scripts/event-qr.sh`)

UTMs follow `growth/utm-conventions.md` (lowercase snake_case slugs, `utm_source=qr_code`, `utm_medium=event`). `qrencode -s 16 -m 4 -l H`: 16 px modules for print, the 4-module quiet zone scanners need, and high error correction so a scuffed corner still scans.

## Third-party notices

whisper.cpp, which `scripts/build-whisper.sh` builds into the dictation sidecar, is MIT licensed. Provider logos ship verbatim from models.dev (MIT) through its per-provider logo endpoint, never hand-approximated; Anthropic's current starburst comes from LobeHub's `claude` icon because models.dev still serves the retired glyph. The marks live in `app/src/components/shell/provider-marks.tsx`, `provider-marks-extra.tsx` and `provider-logo-map.ts`.
