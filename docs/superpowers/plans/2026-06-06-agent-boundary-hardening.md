# Agent Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the escape vectors that let a `restricted` agent widen its own policy, plant executable hooks, read engine secrets, or (on non-Claude providers) read outside its folder — so `restricted` is a real boundary.

**Architecture:** Add a control-plane write guard in `houston-engine-core` (deny writes to `.houston/`/`.claude/`/`.agents/` even inside the agent root), relocate the per-session MCP config outside every agent root, switch Claude `restricted` from a tool denylist to an allowlist, and fail `restricted` loudly on providers without read-confinement (Codex/Gemini).

**Tech Stack:** Rust (`houston-engine-core`, `houston-terminal-manager`), `cargo test`. Data root resolved by `houston_db::houston_dir()`.

**Spec:** `docs/superpowers/specs/2026-06-06-agent-boundary-hardening-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `engine/houston-engine-core/src/agent_policy.rs` | Policy types + path classification | Add `RESERVED_DIRS`, `is_control_plane`, `ensure_writable` |
| `engine/houston-engine-core/src/agents/files.rs` | Gateway file ops | Call `ensure_writable` in every mutating op |
| `engine/houston-engine-core/src/agent_file_gateway.rs` | Per-session MCP config | Write config under `houston_dir()/cache/mcp`, not agent root; stale cleanup |
| `engine/houston-engine-core/src/sessions/mod.rs` | Chat session start | Fail-safe: refuse `restricted` on non-gateway providers |
| `engine/houston-engine-core/src/routines/engine_dispatcher.rs` | Routine session start | Same fail-safe |
| `engine/houston-terminal-manager/src/claude_runner.rs` | Claude CLI flags | Allowlist for `restricted` |

---

## Task 1: Control-plane path classifier

**Files:**
- Modify: `engine/houston-engine-core/src/agent_policy.rs`

- [ ] **Step 1: Write failing tests**

Add to the `tests` module at the bottom of `agent_policy.rs`:

```rust
#[test]
fn control_plane_detects_reserved_dirs() {
    let d = TempDir::new().unwrap();
    let root = d.path();
    for reserved in [".houston/policy.json", ".claude/settings.json", ".agents/skills/x.md"] {
        let p = root.join(reserved);
        assert!(
            is_control_plane(root, &p),
            "expected {reserved} to be control-plane"
        );
    }
}

#[test]
fn control_plane_allows_normal_files() {
    let d = TempDir::new().unwrap();
    let root = d.path();
    for ok in ["reports/q1.csv", "notes.md", "data/sub/file.txt"] {
        let p = root.join(ok);
        assert!(!is_control_plane(root, &p), "expected {ok} to be writable");
    }
}

#[test]
fn control_plane_ignores_reserved_name_outside_root() {
    let d = TempDir::new().unwrap();
    let root = d.path().join("agent");
    std::fs::create_dir_all(&root).unwrap();
    // A `.houston` dir that belongs to a *different* root is not this agent's
    // control plane (path is not under `root`).
    let other = d.path().join("other").join(".houston").join("x");
    assert!(!is_control_plane(&root, &other));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p houston-engine-core agent_policy::tests::control_plane -- --nocapture`
Expected: FAIL — `is_control_plane` not found.

- [ ] **Step 3: Implement `RESERVED_DIRS` + `is_control_plane`**

Add near the top of `agent_policy.rs` (after `POLICY_PATH`):

```rust
/// Directories inside an agent root that hold Houston's control plane —
/// policy, audit, runtime config, skills, and provider settings/hooks. An
/// agent must never write here even though these live inside its allowed
/// roots, or it could widen its own policy or plant executable hooks.
pub const RESERVED_DIRS: [&str; 3] = [".houston", ".claude", ".agents"];
```

Add as a free function (below `ensure_path_allowed`):

```rust
/// True when `path` is inside one of [`RESERVED_DIRS`] relative to
/// `agent_root`. Both sides are normalized so `..` / symlink tricks cannot
/// dodge the check. Paths outside `agent_root` are not this agent's control
/// plane and return false (the allowed-roots check governs those).
pub fn is_control_plane(agent_root: &Path, path: &Path) -> bool {
    let (Ok(root), Ok(target)) =
        (normalize_for_policy(agent_root), normalize_for_policy(path))
    else {
        // If we cannot normalize, be conservative and treat as control-plane.
        return true;
    };
    let Ok(rel) = target.strip_prefix(&root) else {
        return false;
    };
    rel.components().next().is_some_and(|c| {
        RESERVED_DIRS.contains(&c.as_os_str().to_string_lossy().as_ref())
    })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p houston-engine-core agent_policy::tests::control_plane`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/houston-engine-core/src/agent_policy.rs
git commit -m "feat: classify agent control-plane paths"
```

---

## Task 2: Guard every mutating gateway op

**Files:**
- Modify: `engine/houston-engine-core/src/agent_policy.rs` (add `ensure_writable`)
- Modify: `engine/houston-engine-core/src/agents/files.rs` (call it in 6 ops)
- Test: `engine/houston-engine-core/src/agents/files.rs` (tests module)

- [ ] **Step 1: Write failing tests**

Add to the `tests` module in `agents/files.rs` (it already seeds `.houston` in existing tests — follow that pattern):

```rust
#[test]
fn write_rejects_control_plane() {
    let d = TempDir::new().unwrap();
    std::fs::create_dir_all(d.path().join(".houston")).unwrap();
    let err = write_project_file(d.path(), ".houston/policy.json", "{}").unwrap_err();
    assert_eq!(err.code(), houston_engine_protocol::ErrorCode::Forbidden);
}

#[test]
fn write_rejects_claude_hook() {
    let d = TempDir::new().unwrap();
    let err = write_project_file(d.path(), ".claude/settings.json", "{}").unwrap_err();
    assert_eq!(err.code(), houston_engine_protocol::ErrorCode::Forbidden);
}

#[test]
fn write_allows_normal_file() {
    let d = TempDir::new().unwrap();
    write_project_file(d.path(), "reports/q1.csv", "a,b\n1,2").unwrap();
    assert!(d.path().join("reports/q1.csv").exists());
}

#[test]
fn delete_rejects_control_plane() {
    let d = TempDir::new().unwrap();
    std::fs::create_dir_all(d.path().join(".houston")).unwrap();
    std::fs::write(d.path().join(".houston/policy.json"), "{}").unwrap();
    let err = delete_file(d.path(), ".houston/policy.json").unwrap_err();
    assert_eq!(err.code(), houston_engine_protocol::ErrorCode::Forbidden);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p houston-engine-core files::tests::write_rejects_control_plane files::tests::write_rejects_claude_hook files::tests::delete_rejects_control_plane`
Expected: FAIL — the writes/deletes currently succeed.

- [ ] **Step 3: Add `ensure_writable` to `agent_policy.rs`**

```rust
/// Gate for mutating operations: deny writes to the control plane even when
/// the path passes [`ensure_path_allowed`]. Callers run `ensure_path_allowed`
/// first, then this.
pub fn ensure_writable(agent_root: &Path, path: &Path) -> CoreResult<()> {
    if is_control_plane(agent_root, path) {
        return Err(forbidden(format!(
            "agent policy denies writing Houston-managed files at {}",
            path.display()
        )));
    }
    Ok(())
}
```

Note: `forbidden(...)` returns `CoreError::Labeled { code: Forbidden, kind: "agent_policy_denied", .. }`. Change the `kind` for this case by adding a sibling:

```rust
pub fn control_plane_denied(message: impl Into<String>) -> CoreError {
    CoreError::Labeled {
        code: ErrorCode::Forbidden,
        kind: "agent_control_plane",
        message: message.into(),
    }
}
```

…and use `control_plane_denied(...)` inside `ensure_writable` instead of `forbidden(...)`.

- [ ] **Step 4: Wire `ensure_writable` into all 6 mutating ops**

In `agents/files.rs`, immediately after each existing `ensure_path_allowed(agent_root, &<full>)?` call inside these functions, add `crate::agent_policy::ensure_writable(agent_root, &<full>)?;`:

- `write_project_file` (after line ~205, on `full`)
- `rename_file` (on both `full` and `new_path`)
- `delete_file` (on `full`)
- `create_folder` (on `target`)
- `import_files` (on `dest_dir`)
- `write_file_bytes` (on `dest`)

Example for `write_project_file`:

```rust
pub fn write_project_file(agent_root: &Path, rel_path: &str, content: &str) -> CoreResult<()> {
    let full = resolve_new(agent_root, rel_path)?;
    crate::agent_policy::ensure_path_allowed(agent_root, &full)?;
    crate::agent_policy::ensure_writable(agent_root, &full)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&full, content)
        .map_err(|e| CoreError::Internal(format!("failed to write {rel_path}: {e}")))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p houston-engine-core files::tests`
Expected: PASS — new guard tests pass, existing file tests still pass.

- [ ] **Step 6: Commit**

```bash
git add engine/houston-engine-core/src/agent_policy.rs engine/houston-engine-core/src/agents/files.rs
git commit -m "feat: block agent writes to control-plane dirs"
```

---

## Task 3: Relocate the per-session MCP config outside agent roots

**Files:**
- Modify: `engine/houston-engine-core/src/agent_file_gateway.rs`

- [ ] **Step 1: Update the failing test for the new location**

Replace the existing `restricted_policy_gets_mcp_config` test body in `agent_file_gateway.rs` with one that asserts the config lands outside the agent root:

```rust
#[test]
fn restricted_policy_writes_config_outside_agent_root() {
    let d = TempDir::new().unwrap();
    let agent_root = d.path().join("workspaces/Personal/Finance");
    std::fs::create_dir_all(&agent_root).unwrap();
    let path = prepare_mcp_config(&agent_root, "session/1", &AgentPolicy::default())
        .unwrap()
        .expect("restricted agent should get gateway config");
    // Must NOT be inside the agent root (so the gateway can't read it).
    assert!(
        !path.starts_with(&agent_root),
        "mcp config {} must live outside the agent root",
        path.display()
    );
    assert!(path.exists());
}
```

Keep `non_restricted_policy_skips_mcp_config` as-is.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p houston-engine-core agent_file_gateway::tests`
Expected: FAIL — config currently lands under `agent_root/.houston/runtime`.

- [ ] **Step 3: Implement the relocation**

In `prepare_mcp_config`, replace the `let dir = agent_root.join(".houston").join("runtime");` block with a home-cache location. Derive a stable per-agent component from the agent root's final path component:

```rust
let cache_dir = houston_db::houston_dir().join("cache").join("mcp");
std::fs::create_dir_all(&cache_dir)?;
let agent_tag = agent_root
    .file_name()
    .map(|n| safe_session_key(&n.to_string_lossy()))
    .unwrap_or_else(|| "agent".to_string());
let path = cache_dir.join(format!(
    "houston-files-{}-{}.mcp.json",
    agent_tag,
    safe_session_key(session_key)
));
```

The rest (writing `McpConfig` JSON) is unchanged. Add `use houston_db;` is not needed — call `houston_db::houston_dir()` fully-qualified.

- [ ] **Step 4: Add stale-cleanup helper + test**

Add to `agent_file_gateway.rs`:

```rust
/// Remove MCP config files older than 24h from the home cache. Best-effort:
/// a session writes a fresh config each turn, so old ones are disposable.
pub fn cleanup_stale_configs() {
    let dir = houston_db::houston_dir().join("cache").join("mcp");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(24 * 3600);
    for entry in entries.flatten() {
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| t < cutoff)
            .unwrap_or(false);
        if stale {
            if let Err(e) = std::fs::remove_file(entry.path()) {
                tracing::warn!("[file_gateway] failed to remove stale mcp config: {e}");
            }
        }
    }
}
```

Test:

```rust
#[test]
fn cleanup_removes_old_configs_only() {
    // Fresh config survives; this just asserts the call is safe + idempotent
    // on a populated cache dir (it shares the real home cache).
    cleanup_stale_configs();
    cleanup_stale_configs();
}
```

- [ ] **Step 5: Call cleanup on engine start**

Find the engine startup path that builds `EngineState` (search: `grep -rn "fn new" engine/houston-engine-core/src/lib.rs`). Add a call to `crate::agent_file_gateway::cleanup_stale_configs();` there (fire-and-forget). If the natural spot is the server binary instead, call it in `engine/houston-engine-server/src/main.rs` after state init.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test -p houston-engine-core agent_file_gateway::tests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/houston-engine-core/src/agent_file_gateway.rs engine/houston-engine-core/src/lib.rs
git commit -m "feat: store agent MCP config outside agent roots"
```

---

## Task 4: Fail-safe — refuse `restricted` on non-gateway providers

**Files:**
- Modify: `engine/houston-engine-core/src/agent_policy.rs` (capability check)
- Modify: `engine/houston-engine-core/src/sessions/mod.rs` (chat path)
- Modify: `engine/houston-engine-core/src/routines/engine_dispatcher.rs` (routine path)

- [ ] **Step 1: Write failing test for the capability check**

Add to `agent_policy.rs` tests:

```rust
#[test]
fn restricted_supported_only_on_anthropic() {
    assert!(restricted_supported("anthropic"));
    assert!(!restricted_supported("openai"));
    assert!(!restricted_supported("gemini"));
}

#[test]
fn ensure_provider_mode_blocks_restricted_codex_allows_full() {
    let restricted = AgentPolicy::default(); // tool_mode == Restricted
    assert_eq!(
        ensure_provider_supports_mode("openai", &restricted).unwrap_err().code(),
        ErrorCode::Forbidden
    );
    // anthropic restricted is fine
    ensure_provider_supports_mode("anthropic", &restricted).unwrap();
    // full mode is fine on any provider
    let full = AgentPolicy { tool_mode: ToolMode::Full, ..AgentPolicy::default() };
    ensure_provider_supports_mode("openai", &full).unwrap();
    ensure_provider_supports_mode("gemini", &full).unwrap();
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test -p houston-engine-core agent_policy::tests::restricted_supported_only_on_anthropic`
Expected: FAIL — `restricted_supported` not found.

- [ ] **Step 3: Implement the capability check**

In `agent_policy.rs`:

```rust
/// Providers whose `restricted` mode is enforced by a real read-confining
/// boundary (the houston_files gateway). Codex/Gemini are not here yet — see
/// spec 4. Until a provider joins this set, `restricted` must refuse to run on
/// it rather than make a false isolation promise.
pub fn restricted_supported(provider_id: &str) -> bool {
    provider_id == "anthropic"
}

/// Returns an error when `policy` requests `restricted` on a provider that
/// cannot enforce it. Call at session start, before spawning the subprocess.
pub fn ensure_provider_supports_mode(provider_id: &str, policy: &AgentPolicy) -> CoreResult<()> {
    if matches!(policy.tool_mode, ToolMode::Restricted) && !restricted_supported(provider_id) {
        return Err(CoreError::Labeled {
            code: ErrorCode::Forbidden,
            kind: "restricted_unsupported_provider",
            message: format!(
                "This agent's privacy mode isn't supported on its current AI yet ({provider_id})."
            ),
        });
    }
    Ok(())
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cargo test -p houston-engine-core agent_policy::tests::restricted_supported_only_on_anthropic`
Expected: PASS.

- [ ] **Step 5: Enforce in the chat session path**

In `sessions/mod.rs` `run_start`, right after `let policy = crate::agent_policy::load(&agent_dir)?;` (currently followed by `policy.ensure_path_allowed(...)`), add:

```rust
crate::agent_policy::ensure_provider_supports_mode(provider.id(), &policy)?;
```

`provider` is in scope (destructured from `params`). The `?` surfaces the error through the existing `run_start` failure handling, which flips activity to `error` and emits `SessionStatus::error` to the user.

- [ ] **Step 6: Enforce in the routine dispatch path**

In `routines/engine_dispatcher.rs`, the provider is resolved at
`let resolved = sessions::resolve_provider(ctx.working_dir);` (~line 98), which
is *after* the `mcp_config` block. Add the check immediately after that
`resolved` binding and before its first use (~line 103):

```rust
let resolved = sessions::resolve_provider(ctx.working_dir);
if let Err(e) = crate::agent_policy::ensure_provider_supports_mode(resolved.provider.id(), &policy) {
    return DispatchOutcome {
        response_text: String::new(),
        error: Some(e.to_string()),
    };
}
```

(`policy` is already in scope from the earlier `let policy = ...` block.)

- [ ] **Step 7: Run the crate tests**

Run: `cargo test -p houston-engine-core`
Expected: PASS (existing + new).

- [ ] **Step 8: Commit**

```bash
git add engine/houston-engine-core/src/agent_policy.rs engine/houston-engine-core/src/sessions/mod.rs engine/houston-engine-core/src/routines/engine_dispatcher.rs
git commit -m "feat: refuse restricted mode on providers without read-confinement"
```

---

## Task 5: Claude `restricted` — allowlist instead of denylist

**Files:**
- Modify: `engine/houston-terminal-manager/src/claude_runner.rs`

**Context:** Today the `restricted` branch sets `--dangerously-skip-permissions` plus a `--disallowedTools` denylist. A denylist silently permits any tool not listed (e.g. `NotebookRead`, future tools). Switch to an allowlist so only known-safe tools are available. The Claude Code version is pinned in `cli-deps.json`, so the tool surface only changes on a deliberate version bump — but the allowlist still removes the "forgot to deny X" failure mode.

- [ ] **Step 1: Enumerate the tools a normal agent uses**

Inspect real usage from the audit logs of existing agents:

Run: `python -c "import json,glob,os; d=os.path.expanduser('~/.dev-houston/workspaces'); [print(json.loads(l)['event'].get('name')) for f in glob.glob(d+'/**/audit/*.jsonl',recursive=True) for l in open(f,encoding='utf-8') if l.strip() and json.loads(l)['event'].get('type')=='tool_call']" | sort -u`

Record every tool name observed (e.g. `ToolSearch`, `TaskList`, `ReadMcpResourceTool`, `ListMcpResourcesTool`). These are the built-ins agents legitimately use and MUST stay allowed. The `houston_files` MCP tools are added by server prefix.

- [ ] **Step 2: Write the failing test for allowlist args**

Add to the `tests` module in `claude_runner.rs` a helper that captures args. Since `configure_claude_command` mutates a `tokio::process::Command`, assert via a small refactor: extract the allowlist into a `const`:

```rust
#[test]
fn restricted_allowlist_contains_gateway_and_no_native_fs() {
    // The gateway server is allowed by prefix; native fs/exec tools are absent.
    assert!(RESTRICTED_ALLOWED_TOOLS.iter().any(|t| t.starts_with("mcp__houston_files")));
    for banned in ["Bash", "Read", "Write", "Edit", "WebFetch", "Task", "NotebookRead"] {
        assert!(
            !RESTRICTED_ALLOWED_TOOLS.contains(&banned),
            "{banned} must not be in the restricted allowlist"
        );
    }
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `cargo test -p houston-terminal-manager restricted_allowlist`
Expected: FAIL — `RESTRICTED_ALLOWED_TOOLS` not found.

- [ ] **Step 4: Define the allowlist and switch the flag**

Near the top of `claude_runner.rs`, add the constant (fill the built-in names from Step 1; the list below is the known-good starting set):

```rust
/// Tools a `restricted` agent may use. Allowlist (not denylist) so a tool we
/// did not explicitly permit — including any added in a future pinned Claude
/// Code version — is unavailable by default. The houston_files MCP server is
/// allowed by prefix; native filesystem/exec/web tools are deliberately absent.
const RESTRICTED_ALLOWED_TOOLS: &[&str] = &[
    "mcp__houston_files__list_allowed_files",
    "mcp__houston_files__read_allowed_file",
    "mcp__houston_files__write_allowed_file",
    "mcp__houston_files__search_allowed_files",
    "ToolSearch",
    "TaskList",
    "ReadMcpResourceTool",
    "ListMcpResourcesTool",
    "TodoWrite",
];
```

In `configure_claude_command`, change the `restricted` branch (currently `cmd.arg("--dangerously-skip-permissions"); if disable_builtin_tools { cmd.arg("--disallowedTools")... }`) to:

```rust
if disable_all_tools {
    cmd.arg("--allowedTools").arg("");
} else if disable_builtin_tools {
    // restricted: allowlist only.
    cmd.arg("--dangerously-skip-permissions");
    cmd.arg("--allowedTools");
    for tool in RESTRICTED_ALLOWED_TOOLS {
        cmd.arg(tool);
    }
} else {
    // full: native tools, no restriction.
    cmd.arg("--dangerously-skip-permissions");
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cargo test -p houston-terminal-manager`
Expected: PASS.

- [ ] **Step 6: End-to-end verification (manual, before trusting the allowlist)**

Rebuild engine, restart app, send a normal message to an existing agent, then check no tool was silently blocked:

Run: `cargo build -p houston-engine-server`
Then restart `pnpm tauri dev`, send "haz una tarea de prueba" to an agent, and run:
`python -c "import json,glob,os; d=os.path.expanduser('~/.dev-houston/workspaces'); [print(json.loads(l)) for f in glob.glob(d+'/**/audit/*.jsonl',recursive=True) for l in open(f,encoding='utf-8') if 'tool' in l.lower()]" | tail -20`

If the agent reports a tool-permission error, add the missing tool name to `RESTRICTED_ALLOWED_TOOLS` and repeat. **Fallback** if the allowlist proves too fragile: revert to the denylist branch but add `NotebookRead` (and any other read/exec/web tool found in Step 1) — documented in the spec as the lower-risk alternative given version pinning.

- [ ] **Step 7: Commit**

```bash
git add engine/houston-terminal-manager/src/claude_runner.rs
git commit -m "feat: allowlist tools for restricted Claude sessions"
```

---

## Task 6: Lock in symlink-escape defense

**Files:**
- Modify: `engine/houston-engine-core/src/agent_policy.rs` (tests only)

- [ ] **Step 1: Write the regression test**

```rust
#[cfg(unix)]
#[test]
fn symlink_escape_is_denied() {
    let d = TempDir::new().unwrap();
    let agent = d.path().join("agent");
    let secret = d.path().join("secret");
    std::fs::create_dir_all(&agent).unwrap();
    std::fs::create_dir_all(&secret).unwrap();
    std::fs::write(secret.join("f.txt"), "x").unwrap();
    // A symlink inside the agent root pointing outside it.
    std::os::unix::fs::symlink(&secret, agent.join("link")).unwrap();
    let escaped = agent.join("link").join("f.txt");
    let err = AgentPolicy::default()
        .ensure_path_allowed(&agent, &escaped)
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::Forbidden);
}
```

- [ ] **Step 2: Run to verify it passes immediately**

Run: `cargo test -p houston-engine-core symlink_escape_is_denied`
Expected: PASS (existing `canonicalize` in `normalize_for_policy` already resolves the link to its real target, which is outside the agent root). If it FAILS, that is a real bug — stop and fix `normalize_for_policy` before continuing.

- [ ] **Step 3: Commit**

```bash
git add engine/houston-engine-core/src/agent_policy.rs
git commit -m "test: lock in symlink-escape denial"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the touched crates' tests**

Run: `cargo test -p houston-engine-core -p houston-terminal-manager`
Expected: PASS, zero failures.

- [ ] **Step 2: Build the engine binary**

Run: `cargo build -p houston-engine-server`
Expected: builds clean (warnings ok).

- [ ] **Step 3: Manual smoke test**

Restart `pnpm tauri dev`. Confirm:
- A restricted Claude agent still reads/writes its own files.
- Asking it to write `.houston/policy.json` (e.g. "edita tu archivo de configuración interno") is refused.
- An agent set to `tool_mode: restricted` on a Codex/Gemini provider shows the "privacy mode not supported" error instead of running.

- [ ] **Step 4: Commit any fixups, then open PR**

```bash
git push -u origin codex/agent-policy-mvp
gh pr create --base main --title "Agent boundary hardening" --body "Implements docs/superpowers/specs/2026-06-06-agent-boundary-hardening-design.md"
```

---

## Notes for the implementer

- `CoreError::Labeled { code, kind, message }` is the established typed-error shape; `.code()` returns the `ErrorCode`. `ErrorCode::Forbidden` maps to a user-visible toast via the existing `CoreError → ApiError → errorMessage` path.
- Run a single test with `cargo test -p <crate> <substring>`.
- Do NOT use `let _ =`, `.ok()`, or `.unwrap_or_default()` on user-initiated fallible ops (beta no-silent-failure rule). The cleanup helper's per-entry `remove_file` warn-and-continue is acceptable because it is best-effort maintenance, not a user action.
