# Changelog

All notable changes to Houston will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Houston ships as a bundle: the **app** follows the top-level semver
(`0.3.x`), the **engine** has its own crate-level semver (`0.4.x`)
paired with a `PROTOCOL_VERSION` (currently `1`). Entries below that
only touch the engine note the engine crate version in parentheses.

## [Unreleased]

### Added
- **`examples/` directory** — reference consumers of `houston-engine`
  for third-party devs building custom frontends. First entry:
  `examples/smartbooks/` — a bookkeeping app with its own brand, no
  `@houston-ai/*` UI deps, ~400 lines TSX, end-to-end demo of the
  soft-workflow pattern (drop PDF → live table → ask to add a column
  → agent edits Python → applies to all clients)
- **pptx workspace glob** — `pnpm-workspace.yaml` now includes
  `examples/*` so SmartBooks (and future examples) resolve
  `@houston-ai/engine-client` as a workspace dependency
- **Knowledge-base entry on custom-frontend gotchas** — documented in
  the SmartBooks README: always call `startAgentWatcher` on mount, WS
  subscribe before firing sessions, feed-item streaming reducer, use
  `/v1/shell` with `open`/`xdg-open` for binary files until a
  first-class binary-read route lands
- **System-prompt user-voice rules** — every agent now follows explicit
  rules about how it talks to the user: no file/JSON/path/CLI/schema
  mentions, no narration of how things are done, only surface missing
  info or the result, short sentences in plain language. Lives in
  `app/src-tauri/src/houston_prompt.rs::HOUSTON_SYSTEM_PROMPT`.
- **Store-package migrations (`.migrations.json`).** Bundled packages
  can now declare per-version rename steps so existing users converge
  to new slugs on update instead of accumulating old-and-new copies
  in their picker. Engine applies renames per-workspace on the next
  sync, preserving each user's edited skill body content. Tracked via
  a new `.houston/bundled-package.json` marker per workspace agent.
  See `store/README.md` for the format.

### Changed
- README points devs at `examples/smartbooks/` as the template for
  building on top of `houston-engine`
- **Bundled Legal agent — full skill rewrite (v0.2.0).** All 40 Actions
  renamed and rewritten so a non-technical founder can read the picker
  cards and instantly know what each one does. Slugs replaced with
  plain-English phrases ("Is this name free?", "Answer a customer data
  request", "Calculate my Delaware franchise tax"). Descriptions and
  form labels rewritten from internal jargon to founder voice. Internal
  procedures unchanged.
- **`knowledge-base/skills.md` — naming rules section added.** Slugs
  must humanize cleanly; no insider acronyms; no `display_name`
  override; descriptions and form labels are user-facing copy.

### Fixed
- **Windows: black-screen + small-loading-window crash loop on first
  launch (engine 0.4.11).** The bundled PortableGit `.7z.exe` was
  previously extracted by invoking the SFX as a subprocess. Igor
  Pavlov's GUI SFX module always renders its own progress dialog
  (this was the "small loading window" users reported), and the
  blocking extraction sat between engine bind and `axum::serve`. On
  every launch the engine missed Tauri's 5s `/v1/health` deadline,
  the supervisor `expect()`-panicked the main window closed, the
  SFX was killed mid-extract, no marker file was written, and the
  next launch produced the same sequence. Houston now extracts the
  embedded 7z archive in-process via `sevenz-rust2` (skipping the
  PE stub), runs the provisioning as a fire-and-forget background
  task so engine HTTP comes up immediately, and uses a temp-dir +
  atomic-rename so a partial extraction never poisons the install.
  Tauri's `wait_until_healthy` budget also bumped from 5s to 30s as
  defense-in-depth against other slow first-boot paths
  (`engine/houston-engine-core/src/git_bash.rs`,
  `engine/houston-engine-server/src/main.rs`,
  `app/src-tauri/src/lib.rs`).

## [0.3.2] — 2026-04-21 (engine 0.4.0)

### Added
- **Standalone `houston-engine` binary** (engine 0.4.0, protocol v1) —
  the axum HTTP + WebSocket server every client now speaks. Ships as
  a Tauri sidecar for the desktop app AND as a self-contained process
  for VPS deployments. Same binary either way.
- **`houston-engine-server` crate** with ~80 REST endpoints across 17
  route modules (workspaces, agents CRUD, sessions, agent data +
  files, routines + scheduler, skills, store, composio, sync,
  worktrees, shell, attachments, preferences, providers, agent-
  configs, conversations, watcher). One integration-test file per
  module under `engine/houston-engine-server/tests/`.
- **`houston-engine-core` crate** — transport-neutral domain logic
  (workspaces, agents, sessions, routines, store, sync, worktree,
  provider, attachments, preferences, conversations, skills,
  agent-configs) relocated out of the Tauri adapter. Now usable from
  REST handlers, CLI tools, and tests.
- **`houston-engine-protocol` crate** — wire types (REST DTOs, WS
  envelope, error codes, `PROTOCOL_VERSION`). Source of truth for
  `ui/engine-client/src/types.ts`.
- **`@houston-ai/engine-client`** TypeScript SDK — single npm package
  with `HoustonClient` + `EngineWebSocket`. ~1200 lines. The one
  dependency third-party devs install to build a custom frontend.
- **Houston Always On** — VPS self-host shipping today. Multi-stage
  Dockerfile (~50 MB runtime), `docker-compose.yml`, systemd unit
  template, README with TLS proxy examples.
- **Engine supervisor** (`app/src-tauri/src/engine_supervisor.rs`) —
  spawns the binary, parses the `HOUSTON_ENGINE_LISTENING` banner
  for `{port, token}`, injects `window.__HOUSTON_ENGINE__` into the
  webview, exponential backoff restart on crash, cross-platform
  parent-death detection via stdin EOF watchdog.
- **File watcher subscription** — `/v1/watcher/start` starts a
  `notify` watcher on an agent folder so writes the CLI agent makes
  directly (bypassing the engine) still emit `FilesChanged` events
  over the WS.

### Changed
- **All domain Tauri IPC commands deleted** — `app/src-tauri/` keeps
  only 7 OS-native commands (pick directory, open URL, reveal file,
  open terminal, check claude CLI). Everything else flows through
  the engine over HTTP/WS.
- **`app/houston-tauri/` renamed from adapter to thin glue layer** —
  event sink bridge, tray UI, path helpers, shared state. No more
  domain logic.
- **Engine is now a subprocess, not in-process** — desktop app
  spawns `houston-engine` on startup via Tauri `externalBin`, the
  webview talks to it at `127.0.0.1:<random>` with a bearer token
  from `~/.houston/engine.json`.

### Fixed
- Orphan engine processes holding ports after app force-quit — stdin
  EOF watchdog + `setpgid` process group kill on supervisor drop
- `Child::wait()` tripping the parent-death watchdog — supervisor
  now takes `ChildStdin` out of `Child` before the first wait
- CORS preflight failures in WKWebView (`PUT`/`PATCH` returning "Load
  failed") — switched to fully permissive CORS (safe because bearer
  tokens aren't CORS credentials)

## [0.3.1] — 2026-04-16

### Added
- **Composio MCP integration** — agent apps marketplace via
  `/v1/composio/*`. OAuth, app catalog, per-agent connections.
- **Workspace templates** — import a whole workspace (multi-agent)
  from a GitHub repo via `POST /v1/workspaces/install-from-github`
- **GitHub agent import** — single-agent one-click install via
  `POST /v1/agents/install-from-github`
- **Routines + scheduler** — cron-style recurring prompts per agent.
  `/v1/routines`, `/v1/routine-runs`, `/v1/routines/scheduler/*`
- **Houston Mobile** — Capacitor + React PWA companion, deploys to
  Cloudflare Pages. Pairs with the desktop via the
  `desktop-mobile-bridge/` relay Durable Object.
- **Auto-updater** — Tauri plugin, signed update artifacts pointed
  at GitHub Releases, in-app update banner + restart

### Changed
- Renamed "Space" back to "Workspace" (0.2.0 rename reverted —
  workspace is the industry-standard term)
- `.houston/<type>/<type>.json` typed layout (was flat
  `.houston/<type>.md` in 0.1.0) with embedded JSON Schemas
- Skills convention aligned with Claude Code: `.agents/skills/<name>/SKILL.md`
  with a symlink to `.claude/skills/<name>`

## [0.3.0] — 2026-04-11

### Added
- Single rolling `claude_session_id` per conversation — restart-safe
  chat history via `--resume`
- Per-agent file watcher + event-driven query invalidation
  (TanStack Query keys re-fetched on `FilesChanged`)
- Drafts persistence for in-flight message composition
- Sentry + Aptabase analytics wired to env vars (opt-in)

### Changed
- Moved Rust domain logic from `app/houston-tauri/src/commands/` into
  standalone crates (`houston-agent-files`,
  `houston-agents-conversations`, `houston-terminal-manager`, …) —
  groundwork for the engine split in 0.3.2
- Made all `.houston/` writes atomic (temp + rename) with
  `safe_relative` path-traversal guards

## [0.2.0] — 2026-04-06

### Added
- **Spaces** — top-level organizational container (replaces "Organization"). Space switcher in sidebar, CRUD commands in Rust, `useSpaceStore` in frontend
- **Dashboard view** — grid overview of all workspaces in current space
- **Connections view** — space-scoped channel and service management
- **Per-task Claude sessions** — each kanban card is a Claude conversation with its own session and chat history
- **Kanban column `onAdd` button** — "+" button in column headers for creating tasks directly from the board
- **New conversation panel** — dedicated panel for starting conversations on tasks
- **ChatSidebar** — progress tracking sidebar showing step checklist + channels list, moved to `@houston-ai/chat`
- **ProgressPanel** — step-by-step agent progress checklist alongside chat
- **`.houston/prompts/` convention** — editable system prompt components (`system.md`, `self-improvement.md`)
- **Context tab** — editable CLAUDE.md + prompt files in the workspace
- **Welcome screen** — first-launch onboarding to create initial space

### Changed
- Renamed "Organization" to "Space" across app, stores, and Rust commands
- Standardized sidebar layout: Space switcher + Dashboard + Connections + AI Workspaces
- Extended `AppSidebar` to support workspace management (rename, delete, create)
- Sidebar width now persists via preferences
- All Tauri invoke parameter names use `snake_case` to match Rust
- All Tauri command errors surface as toasts (no silent failures)

### Fixed
- Chat history persistence — conversations survive app restarts
- Tab persistence across workspace switches
- Delete/rename parameter passing to Tauri commands
- Empty states for all tabs
- Preference commands (serde camelCase alignment)
- ContentArea wrapper removed — tab layouts and centering fixed
- Compiler warnings cleaned up
- First launch with existing space directory handled gracefully

## [0.1.0] — 2026-04-05

### Added
- Houston unified app with experience system
- Experience manifests (JSON-only and custom React tiers)
- Workspace management (create, rename, delete)
- 10 built-in tab components (chat, board, skills, files, connections, context, routines, channels, events, learnings)
- 11 React packages (@houston-ai/core, chat, board, layout, workspace, skills, connections, events, routines, review, memory)
- 8 Rust crates (houston-sessions, houston-db, houston-tauri, houston-channels, houston-events, houston-scheduler, houston-memory, houston-skills)
- create-houston-experience CLI
- Component showcase app

### Changed
- Rebranded from Keel & Deck to Houston
- Workspace convention: .keel/ → .houston/
- Events: KeelEvent → HoustonEvent

[Unreleased]: https://github.com/gethouston/houston/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/gethouston/houston/releases/tag/v0.3.2
[0.3.1]: https://github.com/gethouston/houston/releases/tag/v0.3.1
[0.3.0]: https://github.com/gethouston/houston/releases/tag/v0.3.0
[0.2.0]: https://github.com/gethouston/houston/releases/tag/v0.2.0
[0.1.0]: https://github.com/gethouston/houston/releases/tag/v0.1.0
