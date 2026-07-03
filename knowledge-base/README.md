# Knowledge Base

**New architecture: see `convergence/README.md`.** The `engine-*.md` + `cli-bundling.md` + `platform-matrix.md` + `provider-errors.md` docs describe the legacy Rust engine (retired at P6).

Load on demand.

| File | Topic |
|------|-------|
| [architecture.md](architecture.md) | 6 products + 3 code libraries, Engine standalone story, crate list |
| [design-system.md](design-system.md) | Colors, typography, spacing, components, animation |
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
| [engine-protocol.md](engine-protocol.md) | _LEGACY_ — HTTP + WS wire contract of the Rust engine (v3 contract: `packages/protocol/`) |
| [engine-server.md](engine-server.md) | _LEGACY_ — `houston-engine` binary: config, handshake, supervision, deployment |
| [provider-errors.md](provider-errors.md) | _LEGACY_ — provider error taxonomy + classifier contract |
| [platform-matrix.md](platform-matrix.md) | _LEGACY_ — Windows support status at the Rust engine surface |
| [cli-bundling.md](cli-bundling.md) | _LEGACY_ — bundled provider CLIs (retired with the Rust engine) |

**Custom-frontend integration** — the standalone `examples/smartbooks/` reference was REMOVED in the convergence sweep. The frontend-agnostic contract still holds; the canonical non-Tauri consumer is now `packages/web` (the full desktop UI over the host's protocol v3).

How-to stuff (deploy, build, debug) → skills. See `/release`, `/build-app-local`, `/debug`.

**Protocol note** — the agent session protocol (phases, Rule 0, git workflow) lives at the workspace level: `~/dev-houston/CLAUDE.md`. Phase 10 requires updating this KB after changes that introduce a pattern, decision, or gotcha.
