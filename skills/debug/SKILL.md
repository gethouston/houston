---
name: debug
description: Debug bugs in Houston. NEVER guess. Read log files first (dev panes + agent runtime). Add targeted logging if not enough info. Never ask user to copy-paste terminal output.
---

# /debug

**NEVER guess.** Logs always faster than speculation.

## The rule

Bug occurs + fix not obvious →
1. **Read log files FIRST.** They have all errors.
2. Diagnose from ACTUAL error in logs. Not assumptions.
3. Not enough info? Add a targeted `logger.debug()` at the branch point.
4. **Never** ask user to copy-paste terminal output. Read logs directly.

## Log locations

`HOUSTON_HOME` is `~/.dev-houston` in the dev loop, `~/.houston` in production.

| Layer | File | Contents |
|-------|------|----------|
| Dev stack panes | `~/.dev-houston/logs/dev-<pane>.log` (previous boot kept as `.prev`) | Host, gateway, control-plane: everything an mprocs pane prints, and the only place they print. The pane's scrollback dies with the stack; this file does not |
| Agent runtime | `<HOUSTON_HOME>/workspaces/<ws>/<agent>/.houston/runtime/runtime.log` | The agent loop: provider requests, tool calls, and the FULL provider error. The single best source for a turn that went wrong |
| Tauri shell | `<HOUSTON_HOME>/logs/backend.log.<date>` | Desktop shell only: window, sidecar spawn, OS-native commands. Daily rolling, latest = current file |
| Frontend | `<HOUSTON_HOME>/logs/frontend.log` | JS console.error/warn, React crashes, native command failures |
| Cloud dev pods | `~/.dev-houston-cloud/<org>/<slug>/workspaces/…` | One tree per dev engine pod, each with the same per-agent `runtime.log` |

If no log covers the problem, don't guess: give the user exact steps to run the
app so the logs get generated, then read them.

## Logging APIs

```typescript
import { logger } from "@/lib/logger";
logger.error("fetch failed", { url, status });
logger.warn("retry", { attempt });
logger.info("user clicked");
logger.debug("render", { props });
```

`console.error` + `console.warn` are patched to auto-write to `frontend.log`.
The host and runtime log through their own structured loggers; the Tauri shell
is the one Rust surface, `tracing::{info,warn,error,debug}!` → `backend.log`
(default level `info`, override with `RUST_LOG=debug,crate_name=trace`).

## Bug reports

"Report bug" button on error toasts auto-attaches last 50 lines from both logs.

## Adding logging when logs are insufficient

1. Identify suspected code path
2. Add `logger.debug("descriptive message", { relevant_vars })` at branch points
3. Ask user to reproduce
4. Read updated logs
5. Fix w/ actual knowledge

Don't leave debug logs in. Remove after fix.

## Anti-patterns

- ❌ "Let me try X and see if it fixes it" → guess
- ❌ "Can you share the terminal output?" → read the logs yourself
- ❌ `unwrap()` to silence compile errors → hides real failure
- ❌ `let _ = x.await` on ops that can fail → silent failure (banned by style rules)

## Quick checks

```bash
# Tail the host pane
tail -f ~/.dev-houston/logs/dev-host.log

# The agent that misbehaved
tail -100 ~/.dev-houston/workspaces/Personal/<Agent>/.houston/runtime/runtime.log

# Grep for pattern
grep -i error ~/.dev-houston/logs/dev-gateway.log
```

Use the dedicated Read tool, not bash `cat`/`head`/`tail`, when operating through Claude Code.
