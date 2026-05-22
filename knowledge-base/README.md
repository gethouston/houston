# Knowledge Base

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
| [feature-flags.md](feature-flags.md) | Advanced settings, flag registry, 12 rules, adding/migrating/graduating flags |
| [production-infra.md](production-infra.md) | Auto-updater, analytics, Sentry, env vars, CI/CD |
| [quality-and-release.md](quality-and-release.md) | Monorepo hooks, cargo-sync-check, Changesets, verify-all Makefile target |


Mobile-specific docs live under `/docs/`: [mobile-architecture.md](../docs/mobile-architecture.md), [relay-operations.md](../docs/relay-operations.md).

**Custom-frontend integration** → [`examples/smartbooks/README.md`](../examples/smartbooks/README.md) (lives with the code so it stays honest). Includes gotchas every third-party consumer of `houston-engine` hits: start the file watcher, subscribe to WS topics before sessions, feed-item streaming reducer, binary file download workaround.

How-to stuff (deploy, build, debug) → skills. See `/release`, `/build-app-local`, `/debug`.
