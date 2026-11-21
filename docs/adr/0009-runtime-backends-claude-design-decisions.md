# Runtime Claude backend: design decisions

Decisions and external constraints of the Claude Agent SDK backend (`packages/runtime/src/backends/claude`). Complements ADR 0006 (`0006-runtime-design-decisions.md`), which keeps the shorter summary; each section names the symbol it governs.

## Login probes and credential removal (packages/runtime/src/backends/claude/auth-cli.ts, packages/runtime/src/backends/claude/credential-removal.ts)

- `spawnStatusProbe` and `spawnClaudeLogout` build their environments without a token. These operations concern the shared directory's cached login; an ambient `ANTHROPIC_API_KEY` could otherwise answer for a different credential.
- `clearGhostClaudeCredential` removes the materialized file after an authoritative central disconnect because removing `auth.json` alone lets the SDK resume using that file. Revocation reporting cannot repair this state once Anthropic has left the served-providers manifest, so subsequent turns would keep receiving 401 responses until expiry.
- `clearGhostClaudeCredential` resets the probe cache only after removing a file. An already-disconnected runtime receives not-connected answers during ordinary turn synchronization; those answers must not start another subprocess each time.

## Shared login ordering and caching (packages/runtime/src/backends/claude/shared-login.ts, packages/runtime/src/backends/claude/shared-login-file.ts)

- `readSharedLogin` makes a pushed login available across agents on macOS and Windows. A push updates one agent's `auth.json` without updating the OS Keychain used by the other agents, so relying on the platform credential lookup alone would connect only the receiving agent.
- `sharedLoginSupersedes` uses later expiry as evidence of later issuance because Anthropic access tokens have a fixed lifetime. Different token bytes alone establish no ordering and must not displace the runtime's chosen login.
- `readSharedLoginFile` includes the inode in its cache key because credential writers replace files through atomic rename. A replacement can have the same length and millisecond timestamp as its predecessor while carrying different bytes.

## Desktop binary packaging (packages/runtime/src/backends/claude/binary-path.ts)

`resolveClaudeExecutable` uses a separately staged sibling executable because Bun's compiled modules live in `$bunfs`, where the SDK's ordinary package resolution cannot find the on-disk platform package. Keeping the executable in the application bundle, rather than extracting an embedded copy at runtime, also lets the macOS signing and notarization process sign the actual Mach-O that will run.

## CLI request behavior (packages/runtime/src/backends/claude/claude-env.ts)

- `buildClaudeEnv` leaves CLI auto-compaction enabled for growth within a turn. Houston's compaction runs between turns, and a model advertised with a 1M context window can have a 200k window on the connected plan.
- `buildClaudeEnv` uses `API_TIMEOUT_MS` as a response-opening deadline. Claude Code retries requests that reach this timeout; it does not use this setting to terminate a stream whose response has already opened.
- `buildClaudeEnv` requests subprocess environment scrubbing outside Linux. That CLI option also forces `permissionMode: "default"`, which is the permission mode Houston already uses.

## Tool permissions and deferred files (packages/runtime/src/backends/claude/credential-rules.ts, packages/runtime/src/backends/claude/tool-gate-hook.ts)

- `CREDENTIAL_PERMISSION_RULES` must accompany the path guard because a search can cover credential files without naming them individually. Claude Code interprets `Read` deny rules as exclusions for broad Grep and Glob searches and checks them for plain read-only Bash commands such as `cat`. Its `Edit` rules cover both Edit and Write.
- `buildSessionHooks` combines the deferred-file gate and workspace guard in one callback because Claude Code runs a matcher's hooks in parallel. Separate hooks would let path judgment run before the deferred files exist.

## MCP result handling (packages/runtime/src/backends/claude/mcp-tool-adapter.ts)

`adaptTool` saves capped results inside the agent workspace because the CLI's own result persistence starts at approximately 50,000 characters and writes beneath its config directory. Houston's file guard does not let the model read that directory, so relying on the CLI's saved result would leave the model with a reference it cannot open.

## Compaction and transcript maintenance (packages/runtime/src/backends/claude/compact.ts, packages/runtime/src/backends/claude/transcript-clearing.ts)

- `compactClaudeSession` needs an explicit summarization request because the SDK exposes no compaction control request. The returned summary must remain readable by Houston because durable-fact harvesting consumes that text.
- `clearStaleTranscriptResults` performs Houston's own clearing because the CLI's native clearing depends on a server-side flag and an hour of inactivity. Transcript replacement happens between turns, while no CLI process is using the file. Keeping cleared results unchanged until the next batch preserves the prompt-cache prefix.

## Request timing interpretation (packages/runtime/src/backends/claude/model-calls.ts)

`createClaudeCallTimer` prefers the CLI's `ttft_ms` because it measures request dispatch to `message_start` inside the CLI. The inferred interval also includes CLI prompt assembly and pipe transport; observed differences were 7 to 22 ms. When the CLI retries internally, its retry backoff also appears in the inferred interval, so that interval must not be interpreted as provider response time alone.

## Skill discovery (packages/runtime/src/backends/claude/system-prompt.ts)

`buildSkillsSection` supplies the skill index because `settingSources: []` and the disabled `Skill` tool turn off the SDK's own discovery. Reusing pi's loader provides the model with the skill descriptions and file locations that the SDK would otherwise never reveal.

## Subscription-window scheduling (packages/runtime/src/backends/claude/usage-limit.ts)

`classifyClaudeRateLimit` produces `usage_limit_paused` so routines stop spending sandbox turns on a subscription window that remains closed for hours or days. A routine scheduled every five minutes consumed 188 sandbox turns while repeatedly encountering one closed window.

## Credential probe cache (packages/runtime/src/backends/claude/credential-probe-cache.ts)

- The TTL is asymmetric on purpose. The frontend polls `/providers` and `/providers/usage` on a tight cadence and every poll reaches this cache. A connected answer is stable, because Houston's own login and logout routes force a reprobe, so it is reused for `TTL_CONNECTED_MS` (30 s). A disconnected answer must flip within one poll cycle of the user signing in, so it is reused only for `TTL_DISCONNECTED_MS` (2 s).
- An unanswerable probe (spawn error, timeout, garbled output) never overwrites the last known value. It logs the concrete reason, returns the last known answer and sets `UNKNOWN_BACKOFF_MS` (15 s) so a broken probe does not spawn a subprocess per poll. Only an answer refreshes the TTL clock.
- `force` (after a materialize or logout that changed the credential) skips both the TTL and the backoff; the first probe, with no cached answer and no backoff, always runs. Concurrent callers share one in-flight subprocess. The three-state read (`undefined` while nothing ever answered) exists for callers that must not collapse "not asked yet" into "logged out".
