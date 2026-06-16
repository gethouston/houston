# Skill Inspector — NVIDIA SkillSpector security scan

Houston scans a skill's `SKILL.md` with [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) **before it is installed** and warns the user when it looks risky (gate-with-override). This is HOU-493.

## What SkillSpector is

A Python 3.12/3.13 security scanner for AI-agent skills (prompt injection, credential access, supply-chain, tool misuse, dangerous code, YARA malware signatures, …). We run it in static mode:

```
skillspector scan <skill-dir> --no-llm --format json
```

- **Keyless**, and **network-free** for plain `SKILL.md` skills (the one optional call — an OSV supply-chain lookup — only fires when a skill ships a dependency manifest, which community skills don't).
- Emits `risk_assessment.{score 0-100, severity LOW|MEDIUM|HIGH|CRITICAL, recommendation SAFE|CAUTION|DO_NOT_INSTALL}` plus per-issue findings. Exit `0` clean / `1` findings.

There is **no PyPI release and no prebuilt binary** (verified: `pypi.org/pypi/skillspector/json` 404, zero GitHub releases). We pin a commit SHA and install from git source.

## How it's bundled (the important part)

SkillSpector ships as a **relocatable python-build-standalone interpreter** with the package + its deps installed into the interpreter's own `site-packages`, staged per-arch at `Resources/bin/skillspector-<arch>/` — the same per-arch directory model as composio/gemini. See `cli-deps.json#skillspector` and `scripts/fetch-cli-deps.sh` (`stage_skillspector_arch_darwin`).

**Why a real interpreter and not a PyInstaller freeze:** SkillSpector resolves its bundled YARA rule files via `Path(__file__)`. Under a frozen `_MEIPASS` layout `__file__` points into a temp extraction dir, so the scanner compiles **zero rules and silently passes every skill** — a no-silent-failures landmine. A real relocatable interpreter keeps `__file__` correct so all four rule files load. The fetch script's `smoke_scan_skillspector` asserts `compiled 4 YARA rule file(s)` on every build so a broken bundle fails CI instead of shipping a scanner that finds nothing.

**Invocation must bypass the installed launcher.** The console script (unix shebang, or the Windows `.exe` launcher) embeds the absolute build-time path, which is stale once the bundle is relocated into the installed app. The engine always invokes `python -c "from skillspector.cli import app; app()" scan …` — importing the CLI app directly avoids the launcher on every OS. See `houston_cli_bundle::bundled_skillspector_python`.

### Arch / OS coverage

Built per-arch for **all four targets Houston ships** — `darwin-arm64`, `darwin-x64`, `windows-x64`, `windows-arm64` — using the release matrix's native runners (`macos-latest`, `windows-latest`, `windows-11-arm`):

- **darwin-arm64**: native on the Apple Silicon runner. Fully wheel-covered (deterministic).
- **darwin-x64**: same runner, under **Rosetta** (a `softwareupdate --install-rosetta` step lets uv drive the x86_64 interpreter). `cryptography` builds from sdist there.
- **windows-x64**: native on `windows-latest`. Fully wheel-covered.
- **windows-arm64**: native on `windows-11-arm`. A few deps (`cryptography`, `grpcio`, `yara-python`) compile from sdist with the runner's MSVC toolchain.

Staging is **best-effort** (`fetch-cli-deps.sh` wraps each arch in a subshell): a build failure on any arch warns, removes the partial tree, and ships **without** the scanner for that arch rather than failing the release. At runtime that arch degrades cleanly — `bundled_skillspector_python()` returns `None` (it also guards against a hollow tree via `skillspector_pkg_present`), the scan API returns `unavailable`, and install proceeds without the pre-scan. The build logs print a "SkillSpector coverage" line so a missing arch is visible, never silent.

`windows-x64` + `darwin-arm64` are guaranteed (all wheels); `darwin-x64` + `windows-arm64` are first verified on the release runners (same as composio's Windows fork-build and the macOS notarization step).

### Signing

Every Mach-O in the interpreter tree (the `python3` executable, `libpython` dylib, and every C-extension `.so`) is Developer-ID + hardened-runtime signed in `release.yml` (`Pre-sign bundled CLI binaries`), because Apple notary rejects ANY unsigned Mach-O regardless of execute bit. Same-team signatures also satisfy hardened-runtime library validation when the interpreter `dlopen`s its extensions, so no extra entitlement is needed. The `Verify bundled CLI invariants` step walks `.so`/`.dylib` too (not just `+x` files). The fetch script ad-hoc signs the tree for `pnpm tauri dev`.

## Engine

- **`houston-skill-inspector`** (leaf crate) — spawns the bundled interpreter, parses the JSON into typed `Severity` / `Recommendation` / `ScanReport`. `scan_skill_dir(dir)` returns `InspectorError::Unavailable` when the scanner isn't bundled (a normal state, not a failure). Classifier unit-tested against real captured `--no-llm` fixtures (`tests/fixtures/{risky,clean}.json`).
- **`houston-skills::scan`** — `scan_skill_markdown` writes the `SKILL.md` to a temp dir and runs the inspector; `scan_community_skill` / `scan_repo_skill` / `scan_installed_skill` fetch (or read) the md first. `ScanOutcome::{Scanned, Unavailable}`. `SkillError::ScanFailed` covers a real scanner failure (distinct from a scan that ran and flagged the skill).
- **`houston-engine-core::skills::security_scan`** — maps `ScanOutcome` → the wire DTO `SkillSecurityResponse` (`scanned` + report, or `unavailable`), de-duplicating findings and dropping raw code snippets / model intent (the user is non-technical). `SkillError::ScanFailed` → `kind: "scan_failed"` (mirrored in `ui/skills/src/skill-error-kinds.ts`).
- **Route:** `POST /v1/skills/security/scan` with a tagged body `{ target: "community" | "repo" | "installed", … }`. Read-only, never installs.

## Frontend (gate-with-override)

The desktop scans **before** install and only proceeds on the user's confirmation. The install endpoints are unchanged — the gate is enforced client-side (a UX safety feature, not a boundary against the user's own client).

- `@houston-ai/engine-client`: `scanSkillSecurity(target)` + `SkillSecurityResult` / `SkillSecurityReport` types.
- `app/src/components/tabs/use-skill-surface.ts`: `scanAndGate()` wraps the community + repo install handlers. On a `safe`/`unavailable` result it passes straight through; on `caution`/`do_not_install` it opens a confirm dialog and **throws an `AbortError`** if the user declines (the install views reset to idle on abort — see `add-skill-dialog-store-view.tsx` / `-repo-view.tsx`).
- `app/src/components/tabs/skill-security-dialog.tsx`: severity-aware `ConfirmDialog`. Non-technical copy — no rule ids, paths, or raw category jargon. Copy lives under `skills.security.*` in en/es/pt.

## Files of interest

| What | Where |
|------|-------|
| Pinned build (SHA, python, per-arch) | [`cli-deps.json`](../cli-deps.json) `#skillspector` |
| Bundle staging | [`scripts/fetch-cli-deps.sh`](../scripts/fetch-cli-deps.sh) `stage_skillspector_arch_darwin` |
| Resolver | [`engine/houston-cli-bundle/src/lib.rs`](../engine/houston-cli-bundle/src/lib.rs) `bundled_skillspector_python` |
| Scanner wrapper + types | [`engine/houston-skill-inspector/src/lib.rs`](../engine/houston-skill-inspector/src/lib.rs) |
| Scan orchestration | [`engine/houston-skills/src/scan.rs`](../engine/houston-skills/src/scan.rs) |
| Wire DTO + endpoint | [`engine/houston-engine-core/src/skills.rs`](../engine/houston-engine-core/src/skills.rs) `security_scan` + [`routes/skills.rs`](../engine/houston-engine-server/src/routes/skills.rs) |
| Gate hook | [`app/src/components/tabs/use-skill-surface.ts`](../app/src/components/tabs/use-skill-surface.ts) |
| Confirm dialog | [`app/src/components/tabs/skill-security-dialog.tsx`](../app/src/components/tabs/skill-security-dialog.tsx) |
| Signing + invariants | [`.github/workflows/release.yml`](../.github/workflows/release.yml) |

See also `knowledge-base/cli-bundling.md` (bundle mechanics) and `knowledge-base/skills.md` (install flow).
