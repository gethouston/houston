# Runtime pi backend: design decisions

Decisions and external constraints of the harness seam and the pi backend (`packages/runtime/src/backends`, outside `claude/`). Complements ADR 0006 (`0006-runtime-design-decisions.md`), which keeps the shorter summary; each section names the symbol it governs.

## Session recovery and transport (packages/runtime/src/backends/create-session-options.ts, packages/runtime/src/backends/pi/transport-settings.ts)

- `CreateSessionOptions.freshRetryPromptPrefix` stays lazy because building canonical history can read archived transcript segments. A successful native resume must incur none of that work.
- `piTransportSettings` overrides transport in memory on top of the normal loaded settings. The override must leave `settings.json` untouched and preserve the other settings. It must be applied before session construction because pi reads transport once when building the agent.

## Request phases and reply completion (packages/runtime/src/backends/pi/model-phase.ts, packages/runtime/src/backends/pi/reply-beats.ts)

- `subscribePiModelPhase` takes prompt size from the hedged runtime’s actual send because pi emits `turn_start` before appending the new messages. Reading session history at that boundary would underestimate the request. Until the send supplies its size, the small-prompt window bounds request construction. Cache warm-ups, branch summaries and forced tool calls share the runtime but must not change the main round-trip phase.
- `createReplyBeatReader` observes streamed tool-call blocks because `tool_execution_start` arrives only after the input finishes streaming, too late for early reply-completion marks. OpenAI can leave the tool name empty at `toolcall_start` and provide it in a later delta, so the first event carrying a name is the reporting point.

## Session rotation (packages/runtime/src/backends/pi/session-rotation.ts)

`rotateSessionLog` uses its preliminary scan only to rule out definite no-ops. Canonical pi envelopes place `id` immediately after `type`, which permits the lightweight scan. Unrecognized envelopes remain uncertain and go through the full parse. The active-branch traversal, rather than the preliminary scan, determines whether history can be omitted.

## Tool-result context (packages/runtime/src/backends/pi/tool-result-context.ts)

- `makeToolResultContext` clears stale results in batches to preserve prompt-cache reuse. Identical history produces identical projections, so clearing changes the cached prefix only when another batch is removed.
- `makeToolResultContext` memoizes spill outcomes per tool call and projection kind, including failed saves represented by `null`. Content-addressed spilling would otherwise re-hash the same result on every request. Remembering failures also prevents repeated save attempts and repeated error reports.

## Usage normalization (packages/runtime/src/backends/pi/wire.ts)

`normalizeUsage` must accept component counts without `totalTokens` because Gemini through pi’s OpenAI-completions path emits that shape. Dropping such usage would leave the context bar empty and prevent autocompact from triggering.
