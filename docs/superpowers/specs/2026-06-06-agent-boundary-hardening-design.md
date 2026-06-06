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
Anthropic (Claude) provider. This spec closes those holes for Claude and
makes `restricted` fail loudly on providers that cannot yet enforce it. It
must land first, because the follow-on specs build on a boundary that actually
holds.

This is **spec 1 of 4**: (1) boundary hardening — this doc; (2) seamless
permission-grant flow; (3) gateway binary parsing; (4) Codex `restricted` via
the gateway. Each gets its own spec → plan → implementation cycle.

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
| 4 | Denylist misses a read tool (e.g. `NotebookRead`) | `--disallowedTools <list>` | Harden denylist (+`NotebookRead`, `WebSearch`); re-audit on version bump |
| 5 | Codex `restricted` reads anywhere | `--sandbox workspace-write` confines writes only | Fail-safe now (refuse); real gateway routing in its own spec |
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

### 3. Harden the Claude `restricted` denylist (terminal-manager)

**Decision (revised during implementation):** keep the `--disallowedTools`
denylist, but harden it — do **not** switch to an allowlist yet.

Rationale: enumerating real agent tool usage from the audit logs showed agents
rely on a moving set of built-ins (`ToolSearch`, `TaskList`, `Skill`,
`AskUserQuestion`, `ListMcpResourcesTool`, `ReadMcpResourceTool`, …). A strict
allowlist would have shipped incomplete and silently broken agent workflows
that no test exercised. The Claude Code version is pinned in `cli-deps.json`,
so the tool surface only changes on a deliberate bump — which makes a
denylist's "forgot to deny a new tool" risk bounded and reviewable, while the
allowlist's "forgot to allow a needed tool" risk is unbounded and user-facing.

The concrete gap in the current denylist is **read** tools that bypass the
gateway. Add the missing ones:

- `NotebookRead` — reads arbitrary `.ipynb` files anywhere on disk.
- `WebFetch` is already added; add `WebSearch` for completeness (network, not
  local files, but out of scope for a confined agent).

Current denylist: `Bash, Read, Glob, Grep, LS, Edit, Write, MultiEdit,
NotebookEdit, Task, WebFetch`. After: add `NotebookRead, WebSearch`.

`disable_all_tools` (conversation_only) keeps `--allowedTools ""`. `full` keeps
no restriction.

**Re-audit obligation:** every time `cli-deps.json` bumps the Claude Code
version, re-audit its tool list for any new file/exec/network tool and add it
to the denylist. A future spec may revisit a true allowlist once we have
telemetry on the complete set of tools agents legitimately use.

### 4. Provider parity — fail-safe (terminal-manager)

`restricted` must confine reads on every provider, or refuse to run. Today
only Claude (via the gateway) does. Codex's OS sandbox has no
"read-only-within-workspace" mode, and Gemini has no enforcement primitive
wired at all. Rather than let `restricted` silently allow broad reads on those
providers, both **fail loudly**:

- Starting a `restricted` session on Codex or Gemini returns a typed error
  surfaced to the user ("This agent's privacy mode isn't supported on its
  current AI yet"), per the no-silent-failures rule.
- The check lives at session start (engine), before the provider subprocess
  spawns, keyed on `provider.id()` ∉ {gateway-capable set}. Today that set is
  `{anthropic}`; it grows as each provider gets real read-confinement.

Restoring Codex `restricted` properly — routing Codex file access through the
`houston_files` MCP gateway with `--sandbox read-only` so native tools cannot
bypass it — is **its own spec** (Codex is not the default provider, and the
routing is a substantial, provider-specific piece). Until then the fail-safe
guarantees no false isolation. `full` and `conversation_only` modes are
unaffected on all providers.

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
| `claude_runner::configure_claude_command` | Hardened denylist for `restricted` | denylist tool names |
| session-start guard (engine) | Refuse `restricted` on non-gateway providers | `provider.id()`, gateway-capable set |

## Error handling

- Control-plane write → `Forbidden` / `agent_control_plane`, surfaced to the
  user as a real toast (no silent swallow).
- `restricted` on Codex/Gemini → typed `Forbidden`/`Unsupported` error
  surfaced to the user at session start.
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
- Claude `restricted` `--disallowedTools` includes `NotebookRead` and
  `WebSearch` (alongside the existing entries); `full` unchanged;
  `conversation_only` still `--allowedTools ""`.
- `restricted` on Codex returns the typed unsupported error at session start
  (no provider subprocess spawned).
- `restricted` on Gemini returns the typed unsupported error.
- `full` / `conversation_only` on Codex and Gemini are unaffected (still run).
- Path-traversal + symlink escape remain denied (existing canonicalize
  behavior — add an explicit symlink test to lock it in).

## Out of scope (separate specs)

- **Spec 2:** seamless permission-grant flow (attachments + native folder
  picker + access-request store/endpoints/WS event + policy mutation).
- **Spec 3:** gateway parsing of binary documents (xlsx/pdf → text/table).
- **Spec 4:** Codex `restricted` via the `houston_files` gateway +
  `--sandbox read-only`, to lift the fail-safe and restore Codex isolation.

## Resolved during implementation

The allowlist approach (original §3) was dropped after enumerating real agent
tool usage from the audit logs: agents rely on built-ins (`Skill`,
`AskUserQuestion`, `ToolSearch`, `TaskList`, MCP resource tools) that a hand-
written allowlist would have missed, silently breaking workflows. The hardened
denylist (+`NotebookRead`, `WebSearch`) closes the known read gap without that
risk. A true allowlist remains a future option once tool-usage telemetry is
complete.
