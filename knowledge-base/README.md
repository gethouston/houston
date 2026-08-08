# Knowledge Base

Start with [architecture.md](architecture.md) — Houston runs ONE TypeScript engine for desktop AND cloud (the pi runtime behind the host, protocol v3). The legacy Rust `engine/` is deleted; `convergence/README.md` is the record of how we got here.

Load the rest on demand.

| File | Topic |
|------|-------|
| [architecture.md](architecture.md) | Repo shape — the host + pi runtime, adapter profiles, the Tauri shell, every product surface incl. the live native iOS app |
| [client-architecture.md](client-architecture.md) | Three-surface client contract — SDK / design tokens / inventory / parity, and the change-flow procedure for each |
| [dev-loop.md](dev-loop.md) | `pnpm dev` — THE dev entry point: doctor, panes, two-file env model, full multiplayer locally with no Kubernetes (named exceptions: `pnpm ios`, `pnpm dev:staging`) |
| [files-first.md](files-first.md) | `.houston/` on-disk layout, atomic writes, schemas, AI-native reactivity, the boot migrations |
| [windows-vm.md](windows-vm.md) | Testing Windows builds from a Mac — UTM VM setup gotchas, SSH/PowerShell bridge, Windows rules for `app/src-tauri` code |
| [design-system.md](design-system.md) | Deep design narrative — futuristic theme internals, component and animation detail (`/DESIGN.md` is the mandatory compact spec) |
| [sidebar-anatomy.md](sidebar-anatomy.md) | `ui/layout` rail rendering vocabulary — the row component, the geometry module, the test that holds them together |
| [board-shell.md](board-shell.md) | Kept-alive screens, keyboard ownership, and the ONE shared detail panel |
| [teams-ui.md](teams-ui.md) | The whole shell — sidebar teams, the `team` screen, section gating, the team-scoped board, Team Settings drill-in (client-side grouping, NOT multiplayer orgs) |
| [agent-manifest.md](agent-manifest.md) | What an agent IS on disk — manifest shape, tiers, creation/import/activation, and where each of an agent's surfaces lives now |
| [agent-settings.md](agent-settings.md) | The ONE per-agent configuration surface — section model, caps gating, the two doors onto it, the People access choice, read-only, analytics |
| [files-ui.md](files-ui.md) | Files UI — card grid + list views, query/host data flow, upload caps, the preview dialog, chat links into it |
| [skills.md](skills.md) | Skills on disk + UI — frontmatter schema, picker rendering, the manage dialog, the invocation marker |
| [i18n.md](i18n.md) | Translating UI strings — the 23 namespaces, `labels` prop pattern, `t()` rules, plus the iOS String Catalog |
| [providers.md](providers.md) | AI provider + model wiring — catalog, chat model picker, reasoning effort, turn mode, mid-conversation switching |
| [ai-hub.md](ai-hub.md) | AI Hub ("AI models") — the top-level view for connecting AI accounts and browsing providers |
| [provider-errors.md](provider-errors.md) | The eight typed `ProviderError` wire kinds and the inline chat card each one renders |
| [anthropic-credentials.md](anthropic-credentials.md) | Subscription OAuth credential lifecycle — keychain scoping, cloud push, per-turn access-only serve, the single-rotator rule |
| [local-models.md](local-models.md) | BYO local model (LM Studio / Jan / Ollama) reached from a cloud agent, incl. sharing the endpoint with a team |
| [dictation.md](dictation.md) | Desktop-only push-to-talk voice typing — whisper.cpp sidecar, model download UX |
| [integrations.md](integrations.md) | Composio platform mode — the `IntegrationProvider` port, direct vs gateway adapter, the per-agent allowlist, the UI map |
| [custom-integrations.md](custom-integrations.md) | User-added APIs & MCP servers — the `custom` provider behind the same port, secure credential card, agent setup tools |
| [routine-triggers.md](routine-triggers.md) | Event-driven routine wakes — a cron `schedule` OR a `trigger` binding (Composio event or incoming webhook) |
| [agent-store.md](agent-store.md) | Public catalog at agents.gethouston.ai — publish, install, the AgentIR contract (data plane lives in `cloud/`) |
| [portable-agents.md](portable-agents.md) | Package an agent into one `.houstonagent` file and import it into another workspace |
| [teams.md](teams.md) | Multiplayer orgs (client surface) — roles, per-agent access, role matrix v2, org dashboard, Share dialog, invites/audit/usage |
| [spaces.md](spaces.md) | Spaces (C8) — personal + team spaces, the switcher, invites, seat billing, trial and degrade states |
| [ai-accounts.md](ai-accounts.md) | Per-user AI accounts in a team space + the per-agent model ceiling (no shared credential) |
| [mission-attribution.md](mission-attribution.md) | Faces, senders, @mentions and unread on missions — all multiplayer-gated |
| [auth.md](auth.md) | GCP Identity Platform (Firebase Auth) — Google/Apple/Microsoft SSO, email OTP, Keychain, and the Supabase that deliberately stays |
| [production-infra.md](production-infra.md) | Auto-updater, analytics, in-app bug reports, release env vars, code signing, CI/CD |
| [sentry.md](sentry.md) | Crash reporting — three runtimes, one Sentry project, dormant until a DSN is set |
| [hosting.md](hosting.md) | Firebase Hosting — the browser web client (`packages/web`) and the marketing site (`website/`) |
| [ui-testing.md](ui-testing.md) | Playwright e2e + visual regression — the web build, the in-process fake host, per-worker isolation, the CI shard matrix |
| [website-landing.md](website-landing.md) | The landing's black-and-white system — section rhythm, section-aware nav, the download gate, motion stack |
| [website-certificates.md](website-certificates.md) | Bootcamp participation certificates — gateway contract, satori/resvg render pipeline, `/c/<CODE>` pages, the claim wizard |

**Custom-frontend integration** — the standalone `examples/smartbooks/` reference was removed in the convergence sweep (only a stray `tsconfig.json` is still tracked). The frontend-agnostic contract still holds; the canonical non-Tauri consumer is `packages/web` (the full desktop UI over the host's protocol v3).

How-to stuff (deploy, build, debug) → skills. See `/release`, `/build-app-local`, `/debug`.

**Protocol note** — the agent session protocol (phases, Rule 0, git workflow) lives at the workspace level: `~/dev-houston/CLAUDE.md`. Phase 10 requires updating this KB after changes that introduce a pattern, decision, or gotcha.

---

## KB hygiene — Julian-approved changes only (hard rule)

A KB doc is **bullet points of what's actually built**, plus the operational detail that makes each bullet matter ("added X; needed for Y to work on Windows"). Not explanations, not decision essays, not history — git is the changelog.

- **No automatic updates.** Subagents never write here. The main session proposes "add these bullets / delete these lines" at delivery-loop step 4 (after review + Julian's verification); Julian approves or amends before anything is written. Minor changes usually warrant no KB change.
- **Delete stale lines before adding new ones.** Appending without deleting is a defect.
- **One row per doc in the table above.** A new doc that is not indexed here does not exist.
- No line-count target — length is judged by usefulness. The test: a new agent reading cold learns what exists fast, with nothing to mentally discard.
