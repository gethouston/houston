# Knowledge Base

**Architecture: see `convergence/README.md`** — the single TypeScript engine (the host + the pi runtime, protocol v3). The legacy Rust `engine/` has been **deleted**; the old `engine-protocol.md` / `engine-server.md` / `cli-bundling.md` docs were removed with it, and `platform-matrix.md` is now historical (it described Windows support at the Rust engine surface).

Load on demand.

| File | Topic |
|------|-------|
| [architecture.md](architecture.md) | Repo shape — products + the single TS engine (host + pi runtime), the app/Tauri shell, current gaps |
| [dev-loop.md](dev-loop.md) | `pnpm dev` — THE dev entry point: doctor, six panes, two-file env model, engines-as-processes (full multiplayer locally, no Kubernetes) |
| [design-system.md](design-system.md) | Current futuristic theme — tokens, typography, components, animation (deep narrative; `/DESIGN.md` is the compact spec) |
| [design-system-history.md](design-system-history.md) | _HISTORICAL_ — superseded pre-futuristic monochrome ("ChatGPT-like") doctrine, kept for archaeology |
| [client-architecture.md](client-architecture.md) | Three-surface client contract — SDK / tokens / inventory / parity, change-flow procedures |
| [files-first.md](files-first.md) | `.houston/` layout, atomic writes, schemas, AI-native reactivity |
| [skills.md](skills.md) | Skills on disk + UI — frontmatter schema, picker rendering, invocation marker |
| [agent-manifest.md](agent-manifest.md) | Three tiers, manifest shape, workspace templates, sidebar |
| [teams.md](teams.md) | Multiplayer orgs (client surface) — roles/access, role matrix v2, org dashboard, share dialog, templates, allowlists; gateway is sole enforcer |
| [auth.md](auth.md) | GCIP / Firebase auth, Google/Microsoft SSO + email OTP, Keychain |
| [i18n.md](i18n.md) | Translating UI strings — namespaces, `labels` prop pattern, `t()` rules |
| [ui-testing.md](ui-testing.md) | Automated UI / e2e tests — Playwright, web build, fake host, TS engine |
| [portable-agents.md](portable-agents.md) | Package an agent into one file, import into another workspace |
| [production-infra.md](production-infra.md) | Auto-updater, analytics, Sentry, env vars, CI/CD |
| [data-rituals.md](data-rituals.md) | Daily/weekly/monthly data rituals + dashboard reading guide |
| [windows-testing.md](windows-testing.md) | Windows testing loop from a Mac — UTM VM, SSH bridge, cross-compile |
| [provider-errors.md](provider-errors.md) | Provider error taxonomy + card surface (now owned by the TS host / pi) |
| [local-models.md](local-models.md) | BYO local model (LM Studio / Jan / Ollama) → cloud agent via the desktop tunnel bridge |
| [dictation.md](dictation.md) | Desktop-only voice typing — whisper.cpp sidecar, model download UX, platform constraints |
| [platform-matrix.md](platform-matrix.md) | _HISTORICAL_ — Windows support status at the (removed) Rust engine surface |

**Custom-frontend integration** — the standalone `examples/smartbooks/` reference was REMOVED in the convergence sweep. The frontend-agnostic contract still holds; the canonical non-Tauri consumer is now `packages/web` (the full desktop UI over the host's protocol v3).

How-to stuff (deploy, build, debug) → skills. See `/release`, `/build-app-local`, `/debug`.

**Protocol note** — the agent session protocol (phases, Rule 0, git workflow) lives at the workspace level: `~/dev-houston/CLAUDE.md`. Phase 10 requires updating this KB after changes that introduce a pattern, decision, or gotcha.

---

## KB hygiene — condense, don't append (hard rule)

A KB doc is a **current-state reference, not a changelog**. When Phase 10 sends you here, REPLACE — don't pile on.

- **Target ≤200 lines per doc**, and this index one line per entry. A dense reference (step-by-step procedures, wire tables) may run longer *only* if every line earns its place — never by keeping superseded content. If a doc pushes past ~250, it's usually two topics: split it into two focused files.
- **Rewrite the affected section to describe how it works NOW, and delete what the change supersedes.** Never leave "first we did X, then wave 2 also…" layers accumulating — that history is what git is for. If a decision's past genuinely matters, one sentence ("replaced the Rust engine, 2026") is the whole of it.
- This is the repo's `NEVER compress to fit` rule pointed at prose: don't cram, but don't hoard either. The test: a new agent reading the doc cold learns the current system fast, with nothing to mentally discard.
