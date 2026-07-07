---
name: build-app-local
description: Build Houston App locally (macOS). Clean stale artifacts, pnpm tauri build, notarize DMG manually (Tauri skips), staple, verify, copy to ~/Desktop/Houston-{version}.dmg. Fallback when CI broken.
---

# /build-app-local

Manual macOS build. CI broken? Use this. Normal path = `/release`.

## Pre-reqs

Env vars set in shell:
- `APPLE_SIGNING_IDENTITY` — Developer ID string
- `APPLE_API_KEY` — App Store Connect key ID
- `APPLE_API_KEY_PATH` — path to `.p8`
- `APPLE_API_ISSUER` — issuer UUID
- `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `POSTHOG_KEY` · `POSTHOG_HOST` · `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SENTRY_DSN`

## Flow

```bash
# 0. One-time: ensure both macOS rustup targets installed
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# 1. Clean stale
cd ..  # workspace root
rm -rf app/src-tauri/target/universal-apple-darwin/release/bundle
rm -rf app/dist

# 2. Bun-compile the host sidecar for BOTH arches (required for universal).
#    This produces target/host-sidecar/houston-host-<triple> (+ stamps it with
#    HEAD and stages the sibling `claude` binary); build.rs stages both into the
#    bundle and, for a --release build, FAILS if the sidecar's inputs changed
#    since it was compiled (staleness guard). --verify boots the native slice and
#    curls /v1/capabilities + /v1/catalog, so run it on the host-native arch only.
#
#    Cross-arch note: the non-native slice needs its Claude SDK platform package
#    force-installed first (the pnpm store only has the host-matching one). On an
#    Apple Silicon Mac the x86_64 slice needs the darwin-x64 package — match the
#    @anthropic-ai/claude-agent-sdk version in packages/runtime/package.json:
#    pnpm add -w @anthropic-ai/claude-agent-sdk-darwin-x64@<version> --force
scripts/build-host-sidecar.sh aarch64-apple-darwin --verify   # native on Apple Silicon
scripts/build-host-sidecar.sh x86_64-apple-darwin             # cross-arch slice

# 3. Build + auto-sign the app (universal fat binary)
cd app
pnpm tauri build --target universal-apple-darwin
```

Tauri signs `.app`. Does NOT notarize DMG. Must do manually:

```bash
# 4. Submit DMG to Apple for notarization (note universal path)
DMG="src-tauri/target/universal-apple-darwin/release/bundle/dmg/Houston_${VERSION}_universal.dmg"
xcrun notarytool submit "$DMG" \
  --key "$APPLE_API_KEY_PATH" \
  --key-id "$APPLE_API_KEY" \
  --issuer "$APPLE_API_ISSUER" \
  --wait

# 5. Staple ticket to DMG
xcrun stapler staple "$DMG"

# 6. Verify
xcrun stapler validate "$DMG"
spctl -a -vvv -t install "$DMG"
lipo -info "$(hdiutil attach "$DMG" -nobrowse -mountpoint /tmp/hmnt -quiet && echo /tmp/hmnt/*.app/Contents/MacOS/houston-engine)"
# → expect: "Architectures in the fat file: ... x86_64 arm64"
hdiutil detach /tmp/hmnt -quiet
```

## Output

```bash
cp "$DMG" ~/Desktop/Houston-${VERSION}.dmg
```

## Verify install

1. Open DMG on clean Mac
2. Drag to Applications
3. Launch — no Gatekeeper warning
4. Check "About Houston" version matches

## Common issues

- **"App is damaged"** — stapling failed. Re-staple.
- **Notarization rejected** — `xcrun notarytool log <submission-id> --key ...` to see reason.
- **Code sign identity not found** — check `security find-identity -v -p codesigning`. Must match `$APPLE_SIGNING_IDENTITY` exactly.
- **Slow notarization** — Apple servers variable. 2-15 min typical.

## When to use vs /release

| Situation | Skill |
|-----------|-------|
| Normal release | `/release` |
| CI broken, need ship now | `/build-app-local` |
| Testing build locally, not releasing | `/build-app-local`, skip step 6 |
| Auto-updater broken, users stuck on old version | `/build-app-local` + manual distribution |
