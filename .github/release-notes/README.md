# Release notes

Drop a `<version>.md` file in this directory before tagging a release.
The CI workflow (`.github/workflows/release.yml`) reads
`.github/release-notes/<version>.md` and uses it verbatim as the
GitHub release body. Filename matches the tag minus the leading `v`:

| Tag      | File                                |
| -------- | ----------------------------------- |
| `v0.4.0` | `.github/release-notes/0.4.0.md`    |
| `v0.4.1` | `.github/release-notes/0.4.1.md`    |
| `v1.0.0` | `.github/release-notes/1.0.0.md`    |

If no file is present, the workflow auto-generates a changelog from
conventional-commit subjects between the previous tag and HEAD —
useful for quick hotfixes that don't justify hand-written notes.

## What good notes look like

Every release a non-technical user sees should explain:

1. **What changed for them.** Plain language, not commit subjects.
2. **What to do before upgrading.** Quit-the-app reminder, manual
   migration steps, etc. Always include the macOS drag-install
   caveat — it bites every release.
3. **Known limitations.** Things the user might hit and wonder why
   they're broken.

The release ships as a *draft*, so the author can still polish in
the GitHub UI before clicking Publish. The file in this directory is
the starting point, not the final word.

## Workflow

1. Land all changes on `main` via the normal PR flow.
2. Bump version in `app/src-tauri/Cargo.toml`, `app/houston-tauri/Cargo.toml`,
   `app/package.json`, `package.json`.
3. Write `.github/release-notes/<version>.md` (or skip if you want the
   auto-fallback).
4. Commit + push `main`.
5. `git tag v<version> && git push origin v<version>` — CI builds,
   signs, notarizes, and packages the release artifacts, then creates a draft release with your notes.
6. Smoke-test the draft DMG, MSI, and Flatpak as needed.
7. Edit the draft notes if needed, then click Publish.
