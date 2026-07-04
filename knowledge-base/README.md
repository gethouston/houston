# Knowledge Base

**Architecture: see `convergence/README.md`** — the single TypeScript engine (the host + the pi runtime, protocol v3). The legacy Rust `engine/` has been **deleted**; the old `engine-protocol.md` / `engine-server.md` / `cli-bundling.md` docs were removed with it, and `platform-matrix.md` is now historical (it described Windows support at the Rust engine surface).

Load on demand.

| File | Topic |
|------|-------|
| [architecture.md](architecture.md) | Repo shape — products + the single TS engine (host + pi runtime), the app/Tauri shell, current gaps |
| [design-system.md](design-system.md) | Colors, typography, spacing, components, animation |
| [client-architecture.md](client-architecture.md) | Three-surface client contract — SDK / tokens / inventory / parity, change-flow procedures |
| [files-first.md](files-first.md) | `.houston/` layout, atomic writes, schemas, AI-native reactivity |
| [skills.md](skills.md) | Skills on disk + UI — frontmatter schema, picker rendering, invocation marker |
| [agent-manifest.md](agent-manifest.md) | Three tiers, manifest shape, workspace templates, sidebar |
| [auth.md](auth.md) | Supabase auth, Google SSO, Keychain |
| [i18n.md](i18n.md) | Translating UI strings — namespaces, `labels` prop pattern, `t()` rules |
| [ui-testing.md](ui-testing.md) | Automated UI / e2e tests — Playwright, web build, fake host, TS engine |
| [portable-agents.md](portable-agents.md) | Package an agent into one file, import into another workspace |
| [production-infra.md](production-infra.md) | Auto-updater, analytics, Sentry, env vars, CI/CD |
| [data-rituals.md](data-rituals.md) | Daily/weekly/monthly data rituals + dashboard reading guide |
| [windows-testing.md](windows-testing.md) | Windows testing loop from a Mac — UTM VM, SSH bridge, cross-compile |
| [provider-errors.md](provider-errors.md) | Provider error taxonomy + card surface (now owned by the TS host / pi) |
| [platform-matrix.md](platform-matrix.md) | _HISTORICAL_ — Windows support status at the (removed) Rust engine surface |

**Custom-frontend integration** — the standalone `examples/smartbooks/` reference was REMOVED in the convergence sweep. The frontend-agnostic contract still holds; the canonical non-Tauri consumer is now `packages/web` (the full desktop UI over the host's protocol v3).

How-to stuff (deploy, build, debug) → skills. See `/release`, `/build-app-local`, `/debug`.

**Protocol note** — the agent session protocol (phases, Rule 0, git workflow) lives at the workspace level: `~/dev-houston/CLAUDE.md`. Phase 10 requires updating this KB after changes that introduce a pattern, decision, or gotcha.
