# Knowledge Base

**New architecture: see `convergence/README.md`.** The `engine-*.md` + `cli-bundling.md` docs describe the legacy Rust engine (retired at P6).

Load on demand. Style: caveman.

| File | Topic |
|------|-------|
| [architecture.md](architecture.md) | 6 products + 3 code libraries, Engine standalone story, crate list |
| [design-system.md](design-system.md) | Colors, typography, spacing, components, animation |
| [files-first.md](files-first.md) | `.houston/` layout, atomic writes, schemas, AI-native reactivity |
| [skills.md](skills.md) | Skills on disk + UI — frontmatter schema, picker rendering, invocation marker |
| [agent-manifest.md](agent-manifest.md) | Three tiers, manifest shape, workspace templates, sidebar |
| [engine-protocol.md](engine-protocol.md) | HTTP + WS wire contract every client speaks (REST, envelope, auth) |
| [engine-server.md](engine-server.md) | `houston-engine` binary — config, startup handshake, supervision, deployment |
| [production-infra.md](production-infra.md) | Auto-updater, analytics, Sentry, env vars, CI/CD |

**Custom-frontend integration** — the standalone `examples/smartbooks/` reference was REMOVED in the convergence sweep. The frontend-agnostic contract still holds; the canonical non-Tauri consumer is now `packages/web` (the full desktop UI over the host's protocol v3).

How-to stuff (deploy, build, debug) → skills. See `/release`, `/build-app-local`, `/debug`.
