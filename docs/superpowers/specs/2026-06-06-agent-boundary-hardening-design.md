# Agent Boundary Hardening — Design

**Date:** 2026-06-06
**Branch:** `codex/agent-policy-mvp`
**Status:** Draft for review

## Context

The agent access-policy MVP confines each agent to its own folder via three
layers: `policy.json` (allowed/denied roots), the `houston_files` MCP gateway
(replaces native filesystem tools in `restricted` mode), and a prompt section.
A security review surfaced concrete escape vectors that mean the isolation
guarantee is **not yet airtight**, and currently only meaningful for the
Anthropic (Claude) provider. This spec closes those holes. It is the
foundation for two follow-on specs (seamless permission-grant flow; binary
file parsing) and must land first, because both build on a boundary that
actually holds.

This is **feature 1 of 3**. The other two get their own spec → plan →
implementation cycles.

## Goals

A `restricted` agent must not be able to, by any path:

1. Execute terminal commands.
2. Read or write files outside its `allowed_roots`.
3. Escalate its own privileges (widen its policy).
4. Plant code (hooks/config) that Houston or a provider CLI later executes.
5. Read the engine's credentials.

…and `restricted` must mean the same thing across providers (Claude, Codex,
Gemini) — or fail loudly where it cannot.

## The vectors being closed

| # | Vector | Today | Fix |
|---|--------|-------|-----|
| 1 | Self-edit `policy.json` to widen access | `write_*` allows `.houston/policy.json` (inside agent root) | Control-plane write guard |
| 2 | Plant a `.claude/` hook that runs shell | Agent can write `.claude/settings.json` | Control-plane write guard |
| 3 | Read engine token from `mcp-config.json` | Config lives in `agent_root/.houston/runtime/` (readable by gateway) | Move MCP config outside any agent root |
| 4 | Denylist misses a tool (e.g. `NotebookRead`, future tools) | `--disallowedTools <list>` | Switch Claude `restricted` to an allowlist |
| 5 | Codex `restricted` reads anywhere | `--sandbox workspace-write` confines writes only | Route Codex through the gateway / read-confine |
| 6 | Gemini `restricted` has no enforcement | No tool flags, no sandbox, no gateway | Fail-safe: refuse `restricted` on Gemini until supported |

## Design

### 1. Control-plane write guard (engine)

The control plane = any path under a reserved directory **inside an agent
root**: `.houston/`, `.claude/`, `.agents/`. These hold the policy, audit log,
runtime configs, skills, and provider settings/hooks. An agent must never
write them, even though they sit inside its `allowed_roots`.

Add to `agent_policy.rs`:

```rust
pub const RESERVED_DIRS: [&str; 3] = [".houston", ".claude", ".agents"];

/// True when `path` (already normalized) is inside a reserved control-plane
/// directory relative to `agent_root`.
pub fn is_control_plane(agent_root: &Path, path: &Path) -> bool;
```

Every **mutating** gateway operation in `agents/files.rs`
(`write_project_file`, `rename_file`, `delete_file`, `create_folder`,
`import_files`, `write_file_bytes`) calls a new
`ensure_writable(agent_root, &full)?` that returns `Forbidden` with kind
`agent_control_plane` when `is_control_plane` is true. `ensure_path_allowed`
still runs first; the control-plane guard is an additional gate on writes.

Reads of `.houston/` are left readable for now (an agent reading its own
audit/policy is not an escalation), **except** the runtime/config area, which
is moved out entirely by fix #3 so there is nothing sensitive left to read.

### 2. Move the MCP config outside agent roots (engine)

`agent_file_gateway::prepare_mcp_config` currently writes to
`agent_root/.houston/runtime/houston-files-<session>.mcp.json`. Move it to a
home-rooted cache **outside every agent's `allowed_roots`**:

```
<home>/cache/mcp/houston-files-<agent-id>-<session>.mcp.json
```

`prepare_mcp_config` gains a `cache_dir: &Path` parameter (the engine passes
`paths.home().join("cache/mcp")`). Because no agent's `allowed_roots` contains
the home cache, the gateway will never read this file (and the control-plane
guard is moot for it). The engine token (see §5) lives in the MCP config's
`env` field, which is now unreachable by the agent.

Cleanup: stale files under `<home>/cache/mcp/` older than 24h are removed on
engine start (best-effort, logged).

### 3. Allowlist for Claude `restricted` (terminal-manager)

Replace the `--disallowedTools <denylist>` branch in
`claude_runner::configure_claude_command` with an explicit
`--allowedTools <allowlist>` for `restricted`. The allowlist is the **exact
set of tools an agent legitimately needs**:

- The `houston_files` MCP tools: `mcp__houston_files__list_allowed_files`,
  `…read_allowed_file`, `…write_allowed_file`, `…search_allowed_files`
  (plus the permission-flow tool added in spec 2).
- Houston's own agent tools the product depends on — to be **enumerated from
  the codebase and verified by test**, not guessed. The audit log already
  shows real usage (e.g. task tools); the implementer captures the full set
  before flipping the flag.

`disable_all_tools` (conversation_only) keeps `--allowedTools ""`. `full` keeps
no restriction. Only `restricted` changes from denylist to allowlist.

**Risk:** an incomplete allowlist breaks agent functionality. Mitigation: the
implementation plan includes an explicit enumeration step + a test that an
allowed agent can still run a normal task end-to-end before the denylist is
removed.

### 4. Provider parity (terminal-manager)

- **Codex:** `restricted` must confine reads, not just writes. Codex's OS
  sandbox has no "read-only-within-workspace" mode, so the fix is to route
  Codex file access through the same `houston_files` MCP gateway (Codex
  supports MCP servers via config) and run it with `--sandbox read-only` so
  native file tools cannot bypass the gateway. If full gateway routing proves
  larger than this spec, the fallback is the same fail-safe as Gemini (below)
  until it lands — `restricted` on Codex must not silently allow broad reads.
- **Gemini:** no enforcement primitive is wired. Until one exists, starting a
  `restricted` Gemini session returns a typed error surfaced to the user
  ("This agent's privacy mode isn't supported on its current AI yet"), per the
  no-silent-failures rule — rather than running with prompt-only "isolation".

### 5. Token handling (engine)

The engine token passed to the gateway/MCP server is provided via the MCP
config `env` field (now outside agent roots) — never via command-line `args`
(which can appear in process listings) and never in a file an agent can read.
This is a corollary of §2; called out explicitly so spec 2 (which needs the
gateway to call the engine) inherits a safe channel.

## Components & boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `agent_policy::is_control_plane` / `RESERVED_DIRS` | Classify control-plane paths | path normalization |
| `agents/files::ensure_writable` | Gate every mutating op | `is_control_plane`, `ensure_path_allowed` |
| `agent_file_gateway::prepare_mcp_config` | Write session MCP config to home cache, token in `env` | `EnginePaths` |
| `claude_runner::configure_claude_command` | Allowlist for `restricted` | allowlist constant |
| `session_dispatch` (codex/gemini arms) | Apply parity rules | provider sandbox / fail-safe |

## Error handling

- Control-plane write → `Forbidden` / `agent_control_plane`, surfaced to the
  user as a real toast (no silent swallow).
- Gemini `restricted` (and Codex fallback) → typed `Forbidden`/`Unsupported`
  error surfaced to the user.
- All new failures follow the existing `CoreError → ApiError → errorMessage`
  surfacing path.

## Testing

- `is_control_plane`: true for `.houston/policy.json`, `.claude/settings.json`,
  `.agents/skills/x`; false for `reports/x.txt`.
- `write_project_file` / `rename` / `delete` / `create_folder` / `import` /
  `write_file_bytes` each reject a control-plane target with
  `agent_control_plane`.
- A normal file write inside `allowed_roots` still succeeds (regression).
- `prepare_mcp_config` writes outside any agent root and the path is not within
  `resolved_allowed_roots`.
- Claude `restricted` builds `--allowedTools` with the gateway tools and
  **not** `--dangerously-skip-permissions`-without-allowlist; `full` unchanged;
  `conversation_only` still `--allowedTools ""`.
- Codex `restricted` does not run with a read-anywhere sandbox (asserts the
  chosen sandbox arg).
- Gemini `restricted` returns the typed unsupported error.
- Path-traversal + symlink escape remain denied (existing canonicalize
  behavior — add an explicit symlink test to lock it in).

## Out of scope (separate specs)

- **Spec 2:** seamless permission-grant flow (attachments + native folder
  picker + access-request store/endpoints/WS event + policy mutation).
- **Spec 3:** gateway parsing of binary documents (xlsx/pdf → text/table).

## Open question for implementation

The exact Houston-native tool allowlist (fix #3) must be enumerated from the
codebase during planning; this design fixes the *mechanism* (allowlist over
denylist), not the literal list.
