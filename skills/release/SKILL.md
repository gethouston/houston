---
name: release
description: Ship new Houston version. Bump semver across all packages, tag, push, let CI build + sign + notarize. STOP at draft — user publishes manually. Defaults patch bump. Minor needs explicit user permission.
---

# /release

Version. Bump. Tag. Push. Done.

## Versioning

All packages share ONE version. Every release bumps ALL.

- Semver `0.x.y`
- **Default: patch bump** (`0.3.0` → `0.3.1`). Do this always unless told otherwise.
- **Minor bump (`0.3.x` → `0.4.0`) needs explicit user permission.** Never bump minor on own. Suggest: "This might warrant 0.4.0 — want minor?" Wait for approval.
- No rush to 1.0. FastAPI was 0.x for years in prod. Same energy.

## Standard flow (CI/CD)

```bash
./scripts/version.sh 0.3.X          # bump all package.json + Cargo.toml

# REQUIRED for any user-visible release: write the notes file BEFORE
# tagging. CI reads `.github/release-notes/<version>.md` verbatim and
# uses it as the GitHub release body. Skip only for trivial hotfixes
# (CI then auto-generates from conventional-commit subjects, which is
# weak signal for end users). See `.github/release-notes/README.md`
# for what good notes look like + an example at `.../0.4.0.md`.
$EDITOR .github/release-notes/0.3.X.md

git add -A && git commit -m "release: v0.3.X"
git tag v0.3.X
git push origin main --tags
```

GH Actions (`.github/workflows/release.yml`) takes over:
1. Builds `houston-engine` for BOTH `aarch64-apple-darwin` AND `x86_64-apple-darwin`
2. Builds Tauri app w/ `--target universal-apple-darwin` (one fat `.app`)
3. Signs w/ Apple Developer ID (`$APPLE_SIGNING_IDENTITY`)
4. Notarizes `.app` w/ Apple
5. Creates signed `.dmg`
6. Verifies engine sidecar is lipo'd fat (arm64 + x86_64 both present)
7. Generates `latest.json` w/ `darwin-aarch64*` AND `darwin-x86_64*` keys
8. Creates **draft** GH Release w/ all artifacts

One DMG covers Apple Silicon + Intel. See `knowledge-base/production-infra.md` → "macOS Universal".

Duration: ~15-20 min (2-arch compile).

**After CI:** the release stays as a **draft**. Stop there. The user reviews the draft and clicks "Publish" themselves. Do NOT run `gh release edit --draft=false` or otherwise auto-publish — publishing is the user's call, every time.

## Full checklist

1. **Verify:** `cargo check --workspace && cd app && bunx tsc --noEmit`
2. **Commit all changes** to `main`
3. **Bump:** `./scripts/version.sh 0.3.X` (patch default)
4. **Write notes:** `.github/release-notes/0.3.X.md` — narrative, not a commit dump. Cover: what changed for the user, before-you-upgrade caveats (always include the macOS drag-install reminder), known limitations. Pattern from `.github/release-notes/0.4.0.md`. Skip only for trivial hotfixes.
5. **Commit bump + notes:** `git add -A && git commit -m "release: v0.3.X"`
6. **Tag + push:** `git tag v0.3.X && git push origin main --tags`
7. **Wait CI:** ~10-15 min. Check `github.com/gethouston/houston/actions`
8. **If CI fails:** `gh run view <id> --log-failed`, fix, commit. Re-tag = `git tag -d v0.3.X && git push origin :refs/tags/v0.3.X`, then re-tag + push.
9. **STOP. Hand off draft to user.** The CI-created GH Release is a draft. Tell the user it's ready for review and link it. Do NOT publish it yourself — `gh release edit --draft=false` is the user's call. Publishing flips on auto-update for every installed Houston, so it's never auto-pilot.
10. **After user publishes:** Installed apps show "Update available" w/in 30 min or next launch.

## Version bump only (no publish)
```bash
./scripts/version.sh 0.2.0
```

## Common CI failures

- **`bundle_dmg.sh` failed** — flaky CI runner. `gh run rerun <id>`.
- **Missing env var at compile time** — new `env!()` added. Add secret to GitHub AND workflow YAML.
- **Notarization failed** — Apple servers slow. Rerun fixes.
- **TS errors** — run `bunx tsc --noEmit` locally BEFORE tagging.

## Env vars required

See `knowledge-base/production-infra.md` for full table. Short version: `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`, `APPLE_API_ISSUER`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `POSTHOG_KEY`, `POSTHOG_HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN`. CI also `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD`.

Never hardcode. `option_env!()` in Rust, env vars in CI.

## CI broken?
Fallback to manual build → `/build-app-local`.
