# Browser hand-off live view

While an agent's `browser` tool waits on a `handoff`, the person drives the same page through a live view: frames come down an SSE stream and input goes up in POST batches. Both routes are runtime-proxy members under `/agents/:agentId/conversations/:conversationId/browser/`. The module is `packages/sdk/src/modules/browser`; wire shapes and limits are in `packages/wire-types/src/browser-live.ts`.

## One SDK method per route

`connection.ts` receives the module's `watch` and `input` operations as functions, not a client. A handed-in function is not a route hop, so each live-view route keeps exactly one SDK method (`browser.watch`, `browser.input`), which `check:sdk-parity` requires.

## Input goes up in order, exactly once

`input-batcher.ts`, `input-lane.ts` and `input-queue.ts` send the person's input and the viewer's frame acks.

- Nothing is sent before the stream's first status names the hand-off. Every POST then carries it, so no input can act on a later hand-off in the same chat.
- Event batches go one at a time in the person's order, each stamped `batch: { viewer, seq }`. A retry re-sends the same `seq`, so a batch the runtime already applied is not applied twice. `timedPost` drops a late answer after `BROWSER_LIVE_INPUT_TIMEOUT_MS` (15 s) for the same reason: the retry carries the same seq.
- Events and acks run on separate lanes, each one POST at a time with its own backoff, so an ack never waits behind a stuck batch.
- A batch refused as malformed is not re-sent, because it would be refused again. A refused ack is not re-sent either; the next frame's ack supersedes it. A lane reports a repeated 400 once per episode, and only its own success re-arms it (`reportOnce` in `report-once.ts`).
- `input-queue.ts` never builds a body the runtime refuses: at most `BROWSER_LIVE_MAX_EVENTS` (64) events and `BROWSER_LIVE_MAX_BODY_BYTES` (64 KiB, with `ENVELOPE_BYTES` kept for `ack`, `batch` and `finish`), and text split into events of at most `BROWSER_LIVE_MAX_TEXT` UTF-16 units, never inside a surrogate pair. A lone oversized event is still sent so the runtime's refusal gets reported. `forRetry` drops stale pointer moves from a failed batch and keeps only a trailing one, since every press carries its own position.

## Acks are coalesced

Every ack is one POST through the gateway into the sandbox. `ack-pace.ts` sends the highest frame once `BROWSER_LIVE_ACK_INTERVAL_MS` (250 ms) has passed since the first frame it covers arrived, or at once when the unacked frames fill the runtime's window but for `ACK_HEADROOM` (2) frames, or half its bytes. The runtime keeps painting on the rest of the window while the ack travels. A busy page costs one POST per few frames and a quiet one at most four a second. Until the runtime advertises a window on its status (an older runtime never does), the old two-frame window applies, so a new client acks an old runtime's every frame.

## Stream health and reconnects

- `live-stream.ts` treats `BROWSER_LIVE_IDLE_MS` (45 s) without a byte as dead; the runtime heartbeats every 15 s. Every exit aborts the request, so a stream given up on never keeps its connection open. A mid-body read error after a 200 (Chromium's "network error", Firefox's "Error in body stream") is the connection, `cut`, never an answer. Only a failure before any byte is the engine's answer to classify (`refused`).
- `scheduleReconnect` (`connection.ts`) treats a stream that closed without a terminal status as cut. `BROWSER_LIVE_HEALTHY_MS` (10 s) is how long a stream must stay up before the reconnect count resets, because the runtime sends a status and a frame on every connect and so speaking at all proves nothing (`reconnect-policy.ts`). Past the last backoff step the connection is `lost`. Queued input survives `lost`, so `retry` picks the same hand-off up.
- `live-failure.ts` is one table for the stream and the input POST, so the two never read the same answer differently. A proxy's non-JSON 409 still means the hand-off ended. A 401 has already reached the shared auth-expiry notifier through the auth-fetch; retrying is what picks up the refreshed token.
- `readLiveEvent` (`live-event.ts`) skips a message type it does not know, since protocol v3 grows additively, and reports a known type with a broken shape once per connection.

## Finish

`finish-waiters.ts` keeps one pending outcome. A second `finish` before the first settles replaces the outcome, and every caller settles together. `BrowserLiveFinishResult` is `answered` only when the hand-off took the choice or had already ended; `abandoned` means the view closed or the runtime refused the request first. Only `answered` means the person's choice reached the agent.

## Cards in the chat

The card model needs no wire field. `handoff-card.ts` reads the outcome from the `browser` tool's own result (`ERROR handoff_*:`).

- `isBrowserToolName` matches the tool bare (pi) or MCP-prefixed (Claude, `mcp__houston__browser`).
- An empty success is what the history fold writes for a tool call the turn never finished, so a real successful hand-off always says so.
- An unanswered call is `waiting` only while a turn runs and nothing after it shows the turn moved on (`movedOn`): a turn end, a later call that already has its result (tools run one at a time), or a call of another turn. A later call alone is not enough, because a model can ask for the hand-off and another tool in one message. A message the person writes while it waits does not end it; the turn queues that message behind the hand-off.
- `handoff-calls.ts` pairs a result with its call by `turnId` plus `toolIndex` when the result carries them, and otherwise by the chat's rule (`attachToolResult` in `ui/chat`). Either way an unanswered call left by a stop, a provider error or a restart never shifts the pairing of later calls.

### Placement

`handoff-layout.ts` (published as `@houston/sdk/browser-handoff` so the app's pure feed mapping imports it without the SDK barrel) keeps a card in the same place while its turn runs and after it settles. A card goes right after its hand-off. The live fold keeps a turn's whole reply in one entry placed where its first words streamed, often above the hand-off, while the settled transcript puts the reply after the turn's tools. So a reply of the card's turn found before the card moves after that turn's last tool row, and the card never jumps when the turn ends. A moved reply is drawn as finished text (`settled`), never as the streaming tail. `sameTurn` counts two rows as one turn only when both name the same turn or neither names one (a transcript from before turn ids). A stop or restart notice ends a turn like a final result (`TURN_EDGE`).
