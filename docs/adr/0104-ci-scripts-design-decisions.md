# CI scripts: design decisions

Covers `scripts/ci/`, `scripts/test/` and the release shell scripts that CI runs: updater archive and signature checks, notarization, the Gatekeeper assertion, train labels, AppImage repairs, updater channel rewrites, cached release tools and the shell test harnesses.

## Updater archives are compared by entry type

`scripts/ci/tar-entries.mjs` lists every `.tar.gz` entry as type, mode, path and link target, sorted. `tar -t` shows names only, but tauri-plugin-updater (Rust tar crate) resolves a hardlink entry's target against its own working directory, so a hardlink bsdtar emits for a multiply-linked file would break updates on users' machines. The parser handles GNU base-256 sizes (8 GiB and up), pax and GNU long-name headers, and treats hardlinks and symlinks as carrying no data even when a size is set. Symlink modes differ by platform (bsdtar 0755, GNU tar 0777).

## Updater signature verification

`scripts/ci/updater-signature.mjs` and `verify-updater-signature.mjs` verify a signature the way the in-app updater does (minisign-verify): the signature must come from `plugins.updater.pubkey` in `tauri.conf.json`, cover the exact bytes, and carry a valid global signature over its trusted comment. Both the pubkey and the `.sig` are base64 of a minisign text file. Algorithm `ED` signs the BLAKE2b-512 digest of the file; legacy `Ed` signs the bytes. Test vectors were made with `tauri signer generate` and `tauri signer sign` (CLI 2.11.4) using throwaway keys.

## Notarization retries (`scripts/ci/notarize-dmg.sh`)

The DMG is submitted once and both the DMG and the standalone `.app` are stapled (the DMG submission issues the app's ticket too). Upload is retried only while no submission id came back. A dropped or expired `wait` waits again on the same id so the DMG keeps its place in Apple's queue. Everything stops at a deadline (`NOTARY_DEADLINE_SECONDS`, default 85 min, inside the 90 min step cap) rather than after a fixed number of tries, and backoff sleeps (`BASE * 2^(n-1)`, capped at max and at the time left) never overrun it. Invalid or Rejected fails immediately because it is Apple's verdict on these bytes. Stapling is retried with a flat wait because a ticket can lag the Accepted verdict; staple retries do not share the deadline, and 2 targets x 4 waits x 15 s stays inside the 5 min between deadline and step cap. Tests drive it with a fake `xcrun` that replays scripted answers.

## Gatekeeper assertion

`assert-gatekeeper-notarized.sh` checks that `spctl` accepts the item as notarized, not just its exit code: with assessments disabled (some CI images) spctl accepts every item and reports an override, so the script requires `source=Notarized Developer ID` in its output.

## Train labels and train.json

`stamp-train-label.sh`: a train label is cosmetic; `train.json` on the release is the record of what shipped. The script never fails the train: every refusal is an annotation and exit 0; only a usage error is non-zero. Outcomes are `true`, `unchanged` (already at the commit, a re-publish) and `false`. A label at another commit is an `::error::` (labels never move; this is drift or a squatted label). A refused push is a `::warning::`; the known cause is that `GITHUB_TOKEN` lacks the `workflows` permission and GitHub rejects any ref push whose target commit's workflow files differ from the default branch's, which is every image commit older than a workflow change on main. `%` is escaped as `%25` in annotations, the reason is kept to one line, and the local tag is deleted so a retry starts clean.

`write-train-json.sh` records, per half (engine, agentstore), the resolved image, whether the prod dispatch actually went out, and whether the label was stamped. Job outputs survive a failed job, so a resolved image is not proof of a roll: `*_DISPATCHED` is true only when the promote step wrote it. `true` and `unchanged` both mean the label exists. A half whose image never resolved is `null`.

## Linux AppImage repairs

`repair-linux-appimage-sidecar.sh`: Bun standalone executables append their JavaScript payload to the ELF. linuxdeploy's patchelf pass adds `$ORIGIN/../lib` to every dynamic executable, and the rewritten binaries crash in ld.so (SIGSEGV in the symbol-version check) before any code runs; the host never printed its banner and the bundled `claude` died on every command (Linux sign-in failed with exit signal 11). The script rebuilds the AppImage SquashFS with the pristine, already verified binaries, then reads each back from the final artifact and fails closed if a payload changed or landed at the wrong offset. Its test uses fake SquashFS tools backed by tar so it runs without Linux, FUSE or a 200 MB fixture.

`appimage-ldd-shim.sh` sits first on PATH during AppImage bundling. linuxdeploy runs `ldd` on every ELF; `houston-engine` and `claude` are self-contained, ignore `LD_TRACE_LOADED_OBJECTS` when ldd executes them, and exit non-zero, which aborts the bundle. The shim reports those two as "not a dynamic executable" with success and defers to the real ldd for everything else. Any future self-contained externalBin must be added to its match.

## Updater channel rewrites (CI-only edits of tauri.conf.json)

`point-updater-at-cloud-manifest.sh`: local builds (tag `v*`) read `releases/latest/download/latest.json`; cloud builds (tag `cloud-v*`) read `releases/download/cloud-latest/latest-cloud.json`. A cloud app reading the local manifest would auto-update into a local build and lose its baked gateway URL. The cloud endpoint uses the fixed `cloud-latest` tag because cloud releases are prereleases (so they never become GitHub's latest and shadow the local endpoint), and `/latest/` resolves only to non-prereleases. `.github/workflows/cloud-updater-manifest.yml` maintains the rolling `cloud-latest` release.

`point-updater-at-staging-noop.sh`: the staging QA DMG is the same commit, pipeline and signing as the prod cloud DMG, differing only in the baked gateway URL and this rewrite. It must never enter an updater manifest, checksums file or Sentry upload. Its updater points at the `staging-noop` tag, which is never created, so every check 404s; otherwise its first launch would find the published prod build and force-update the staging install into prod. This is safe because the update check is fail-open (`app/src/hooks/use-update-machine.ts` treats a check error as no update).

`configure-ts-engine-unsigned.sh`: unsigned internal test builds turn off `createUpdaterArtifacts`, because `tauri build` otherwise demands an updater signing key. macOS falls back to the ad-hoc `signingIdentity: "-"`. The Windows artifact script copies the `.sig` only when present for the same reason.

All of these edit only the runner's checkout and use Node, which exists on every runner including windows-11-arm, where jq does not.

## Cached release tools

`verify-cache-provenance.sh`: whisper-cli (shipped, Authenticode-signed) and artifact-signing-cli (receives the Azure signing credentials) are restored from caches written on main. Anything that runs on main can write such a cache, including npm lifecycle scripts during `pnpm install`, so a restored file is trusted only when its build-provenance attestation names `release-cache-warm.yml` and the main ref (or `CACHE_PROVENANCE_SOURCE_REF`). On failure the leg discards the restored files and builds from source.

`install-artifact-signing-cli.sh` is the single version pin. `release.yml` and `release-cache-warm.yml` key the cached binary on this script's hash (and on `scripts/build-whisper.sh` for whisper), so any edit to the file, comments included, warms a new cache on the next main push. `--locked` builds from the crate's own Cargo.lock with crates.io checksums verified.

## Shell test harnesses (`scripts/test`)

`check-boundaries.test.sh` copies the real `check-boundaries.mjs` into a throwaway tree (it computes its root from its own location) and asserts a clean tree passes and every way across the boundary fails: deep-relative imports into `packages/host-cloud`, `require()` of a cloud lib, undeclared bare imports, cloud libs or the closed package declared in an open `package.json`, a bare `@houston/host-cloud` import, a cloud lib outside the allowlisted runtime adapter, a reappearing `packages/host-cloud` directory, and cloud imports in a brand-new package (enumeration is dynamic so a new package name cannot evade a fixed list). It also asserts no false failures for commented-out imports, strings ending in the word `from`, leftover gitignored build artifacts under `packages/host-cloud` (pnpm `node_modules` survive a branch switch), and vite-aliased `@houston/*` imports. The runtime's GcsStore adapter is the one allowed exception. For Rule D (the frozen `getEngine()` caller set) an undeclared caller must fail and a declared caller that stopped calling must be removed from the list.

`release-scripts.test.sh` must pass identically on macOS, Linux and Windows git-bash: `version.sh` must produce byte-identical LF-only output, edit only the intended version lines (leaving three-part dependency pins and nested `version` keys alone), and scope the root `Cargo.toml` bump to houston `path =` dependencies. No output may contain a CR byte, the regression the old `jq` rewrite and `sed -i ''` introduced. The fixture crate needs a target because `version.sh` runs `cargo update --workspace`, which aborts on a target-less crate.

`ship-train-scripts.test.sh` uses a label target older than HEAD (the shape of every agentstore label) and a remote that refuses the label push.
