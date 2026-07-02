# Packaged host-sidecar app — the one manual launch step

Everything in the convergence program is automated or contract-tested EXCEPT one
thing a machine can't do for us: launch the NOTARIZED, packaged `.app` (not the
`pnpm tauri dev` loop), connect a real provider, and run one real turn against the
Bun host sidecar. This is the human gate before the P6 default flip.

The dev loop (`pnpm tauri dev`) does NOT exercise this: it runs unsigned, HMR'd,
and can fall into `VITE_NEW_ENGINE_URL` host mode against an externally-run host.
The packaged app is the only place the Tauri shell actually SPAWNS the
bun-compiled host as its bundled, Gatekeeper-scanned, hardened-runtime sidecar.

There are two ways to get the packaged app. Pick one.

---

## Option A — build it in CI (preferred: produces the real signed/notarized artifact)

Since HOU-628, `.github/workflows/release.yml` (tag `v*`) builds the desktop app
around the host sidecar — so a **normal release IS the host-sidecar build**. There
is no separate `host-sidecar-release.yml` (it was planned but never committed; the
build logic lives in `release.yml`).

Trigger it with a version tag (drives the full signed + notarized chain — the Apple
secrets are already on the repo):

```bash
# Bump app/package.json + app/src-tauri/Cargo.toml to <version> first — the `prep`
# job fails the release if the tag and the two manifests disagree.
git tag v0.4.19
git push origin v0.4.19
```

Output: a DRAFT GitHub Release tagged `v<version>` with, per platform:

| Platform | Artifact | Signed |
|---|---|---|
| macOS | `Houston_<v>_universal.dmg` + `.app.tar.gz` + `.sig` | Developer ID, notarized, stapled |
| Windows x64 | `Houston_<v>_x64_en-US.msi` + `.msi.sig` | updater-key only (no OS code-sign yet) |
| Windows arm64 | `Houston_<v>_arm64_en-US.msi` + `.msi.sig` | updater-key only |
| Linux x64 | `*.AppImage` + `*.deb` | unsigned |

Download the macOS DMG from the draft release, then go to **"Run the gate"** below.

---

## Option B — build it locally on macOS (when CI is unavailable)

Same shell env vars as `/build-app-local` (Apple identity + API key + Tauri
signing key + the POSTHOG/SUPABASE/SENTRY build vars). The ONLY differences from
the Rust-engine local build are: compile the Bun host instead of the Rust engine,
and add the `host-sidecar` cargo feature + `VITE_NEW_ENGINE=1`.

```bash
# 0. One-time: both macOS rustup targets + bun on PATH
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# 1. Clean stale (workspace root)
rm -rf target/universal-apple-darwin/release/bundle app/dist

# 2. Bun-compile the host sidecar for BOTH arches + lipo universal
#    (replaces the engine's `cargo build -p houston-engine-server`)
scripts/build-host-sidecar.sh aarch64-apple-darwin
scripts/build-host-sidecar.sh x86_64-apple-darwin
mkdir -p app/src-tauri/binaries
lipo -create \
  target/host-sidecar/houston-host-aarch64-apple-darwin \
  target/host-sidecar/houston-host-x86_64-apple-darwin \
  -output app/src-tauri/binaries/houston-engine-universal-apple-darwin
chmod +x app/src-tauri/binaries/houston-engine-universal-apple-darwin

# 3. Build + auto-sign the app — note --features host-sidecar and VITE_NEW_ENGINE=1
cd app
VITE_NEW_ENGINE=1 pnpm tauri build --target universal-apple-darwin --features host-sidecar

# 4. Notarize the DMG (Tauri signs the .app but does NOT notarize the DMG)
VERSION=$(jq -r .version package.json)
DMG="../target/universal-apple-darwin/release/bundle/dmg/Houston_${VERSION}_universal.dmg"
xcrun notarytool submit "$DMG" \
  --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

# 5. Confirm the staged sidecar is the Bun host, universal + Developer-ID signed
hdiutil attach "$DMG" -nobrowse -mountpoint /tmp/hmnt -quiet
SIDECAR=$(echo /tmp/hmnt/*.app/Contents/MacOS/houston-engine*)
lipo -info "$SIDECAR"          # → x86_64 arm64
codesign -dvv "$SIDECAR" 2>&1 | grep Authority   # → Developer ID Application
hdiutil detach /tmp/hmnt -quiet
```

> The Tauri externalBin name stays `houston-engine-<triple>` for BOTH the Rust
> engine and the host (see `app/src-tauri/build.rs::stage_host_sidecar`), so the
> sidecar inside the `.app` is named `houston-engine*` even though it's the Bun
> host. That's expected.

---

## Run the gate (both options end here)

1. **Install from the DMG on a clean Mac** (or at least drag `Houston.app` to
   `/Applications` and quit any running copy first — macOS won't reliably replace
   a running app).
2. **Launch it.** No Gatekeeper "damaged / unidentified developer" warning ⇒ the
   notarized chain is intact. On first launch the Tauri shell spawns the bundled
   Bun host, waits for its `HOUSTON_HOST_LISTENING` banner, and health-checks
   `/health` (a Gatekeeper first-run scan can add ~15-20 s — the 30 s banner
   timeout covers it).
3. **Connect a real provider** in the app — Anthropic or OpenAI/Codex OAuth
   (local profile keeps both; this is the connect-once flow, no API-key paste).
4. **Run ONE real turn**: send a message to an agent and confirm a streamed reply
   comes back. This proves the full chain end to end: Tauri shell → spawned Bun
   host → in-process pi runtime → provider → SSE back to the webview. Then poke
   one reactive surface (e.g. ask the agent to create a skill or a routine and
   confirm the UI updates without a manual refresh) to confirm `/v1/events`
   reactivity through the packaged sidecar.

If all four pass, the host-sidecar packaged path is proven and the P6 default
flip (and Rust engine deletion) is unblocked on the desktop side.

### If it fails

Don't blind-fix. The host logs to stdout/stderr captured by the supervisor; on a
packaged app the quickest signal is Console.app filtered to "Houston" plus the
banner/health-check messages. The most likely failure modes:

- **Hangs at splash, never serves** — the staged sidecar isn't the host, or it
  crashed before the banner. Re-check step 5 (`lipo -info` + Authority) and the
  `HOUSTON_HOST_LISTENING` line in logs.
- **Gatekeeper kills the sidecar** — it shipped ad-hoc-signed or without hardened
  runtime. The CI macOS job asserts both invariants; a local build that skips
  notarization will hit this.
