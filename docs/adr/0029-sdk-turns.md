# Turn lifecycle in the SDK

The turns module (`packages/sdk/src/modules/turns`) is the write half of a conversation: sending a turn, following its stream, settling it, and folding everything into the conversation view model every surface renders. It is the one place the turn dialect lives (what counts as delivered, stopped, not connected, lost). Desktop, web and the AI Manager all run this code.

The single rule behind most of what follows: a turn settles only on proof. A dropped connection, a silent stream or a lost response is never treated as the end of a turn or as a failed send without evidence, because that once rendered truncated replies and error cards against turns that were still running.

## Outputs

The machinery emits only through the `FeedOutput` port (`feed-output.ts`): feed items, session status and the board-card status, plus optional additive hooks (`confirmIdle`, `stampUserTurn`, `firstResponse`, `sendWaiting`). A host supplies the implementation. `createTurnsModule` (`index.ts`) always attaches two: the conversation VM (`vm-output.ts`) and `ActivityStatusOutput` (`activity-status-output.ts`), which persists the card through the activities module's `setStatusBySessionKey`, so a binder that never calls `addOutput` still moves a settled mission out of running. A host attaches its own with `addOutput`, and `MultiplexFeedOutput` fans each frame out once, with no reprocessing. `ActivityStatusOutput` logs and swallows a failed board write so it never rejects the settle; the activities persister is injected as one bound function so turns never depends on the whole activities module.

## Board status: needs_you, error, never done

`TerminalBoardStatus` has two values. A clean finish, a turn that ended asking for something, and a handled non-success (the person's Stop, a logged-out provider) all land on `needs_you`; only a real failure is `error`. A turn never writes `done`; only the person closes a mission, so nothing is archived from under them (`finishOk` in `turn-settle.ts`).

- The VM carries `boardStatus` beside `sessionStatus` because it is the only signal that tells a handled settle from a failure. A Stop settles `sessionStatus === "error"` but `boardStatus === "needs_you"`, so a surface keying on `sessionStatus` alone would show a normal Stop in red.
- `pendingInteraction` (ask_user, request_connection, plan_ready, or a pure suggest offer) rides the terminal persist and does not pick the status. It is cleared at turn start and on every settle without one.
- `reply_complete` (`reply-phase.ts`) hands the card back early with a provisional write once the reply finished streaming and only the wrap-up remains. More visible text, thinking, or a tool that is not an offer takes the card back. The VM folds a provisional write only into `replyComplete`, never into `boardStatus`, because `boardStatus` leaving running is what the completion notification waits for (`vm-reply-phase.ts`). A surface ends its Stop affordance at `replyComplete`.
- Card writes for one card queue in order (`board-writes.ts`), each waiting at most `BOARD_WRITE_WAIT_MS` (15 s) for the one before it. `settleCard` queues the settle write before the settle publishes its session status, because that publish can start the next turn synchronously, and the next turn's `running` write must queue behind it rather than race it.
- `finishResumed` (`finish-resumed.ts`) covers a turn the engine interrupted and is already running again by itself. It leaves the card `running`, because `needs_you` or `error` would both misdescribe an agent that is still working.

## The conversation view model

`ConversationVmOutput` (`vm-output.ts`) publishes each conversation on `conversationScope`, which is agent-qualified because session keys are unique only within one agent (ADR 0001). No caller builds or parses the scope string.

- Streaming text is cumulative, so it updates one entry in place, and the final `assistant_text` finalizes that same entry, keeping its original `ts`. A reply is always one bubble.
- **Optimistic sends.** The one optimistic `user_message` push carries `pending: true`. Any later real push or a terminal status clears every pending entry at once; another optimistic push never does, so two queued prompts both keep their clock. A client-made send-failure notice (`fails_pending`) sets `failed` instead. `failPending` is a no-op once server evidence confirmed the bubble, so a delivered turn that later errors never shows a failed tick. Seeded history never carries `pending`.
- **Dedup by turn identity.** Live pushes and seeded frames carry `turnId`, and tool rows also `toolIndex`. `upsertByTurn` updates the entry the same turn already put on screen instead of appending, which makes the fold idempotent under replay: the reply persists before the terminal frame, so a chat-open read can seed it while the snapshot still says running. `SINGLETON_TYPES` dedupe on `turnId` alone; `system_message` is deliberately not one, since a turn can carry a stop line and a reload-failure line. Re-delivered finals also close an orphaned streaming counterpart a dead sink left open. `final_result` keeps its first data, because the seeded copy carries the persisted usage the context indicator reads and a re-settle's invisible final has none.
- `openRun` drops a streaming registration that belongs to a different turn (a prior bubble a dead sink left open) or whose entry vanished in a reseed, rather than splicing new content into it. With no open run, it adopts the same turn's bubble already on the feed.
- **Memory.** Conversations live in an LRU of `DEFAULT_CONVERSATION_CACHE_MAX` (50). A conversation with a running turn, an open stream, a queued message, an unconfirmed send, or an active subscriber is pinned (`isConvLive`); only settled, unviewed ones are evicted, and eviction also clears the retained snapshot. `forget` drops one immediately when a surface closes it. Either way the next `observe` rehydrates from history.
- **Seeding.** `seedHistory` replaces the feed and resets the streaming map, so a live observer starts its running turn's bubble cleanly. It leaves `sessionStatus` and `boardStatus` to the observer. It cannot double the running turn, because an unsettled reply is not in history yet. A windowed read stamps `historyWindow`; a cache paint or full seed clears it, so load-older never trusts a stale window. `stampHistoryWindow` records a window without reseeding when the read matched what is on screen. `prependHistory` adds an older window and keeps existing ids.
- `truncateFromTurn` folds an edit-and-resend rewind explicitly, after the server accepted it, because the seed decision skips a shorter incoming fold (the guard that protects loaded pages) and would otherwise leave the dropped turns on screen. It also drops any pending card those turns settled on.
- `stampUserTurn` gives the last id-less user bubble its turn id when the engine echoes the send (sends are serialized per conversation), so the rewind works on a live chat without a reload.
- `confirmIdle` clears a VM still saying running after the server confirmed the conversation idle: a stream torn down without a settle otherwise wedges the send queue and spinner forever.
- `findLast` is a local helper because the SDK targets ES2022 for older WKWebViews.

## Sending a turn

`streamTurn` (`turn-stream.ts`) subscribes first, so the terminal frame cannot be missed, then sends with a nonce the engine echoes on the `user` frame. The subscription is resumable (`?after=<seq>`), so a transport close never settles the turn.

- **Per-turn pin.** A model or effort pick rides the send as `TurnWirePin` in engine ids, paired with its owning provider by `resolveModelSettings` (`model-settings.ts`), because the runtime refuses a model under a different provider. It is never a `setSettings` write: a pick in one conversation must not move the agent-wide provider every other conversation falls back to. A model the listing does not own passes through alone; the pick is best effort and never fails the turn here. `mode` is a pure per-turn pin; omitted, the conversation's kept mode applies, else execute. `provider` only labels the reconnect card, because a not-connected refusal cannot name one.
- **Bubble text.** The optimistic bubble shows `displayText ?? prompt` while the engine runs on `prompt`, for hidden setup directives and appended attachment paths. The runtime persists `displayText` so a reload matches. An empty `mentions` list is normalized away once, so neither the bubble nor the body carries `mentions: []`. `author` and `mentions` are supplied by the caller; the SDK never infers identity. `approvals` and `missionTitle` are wire passengers the host reads and the SDK ignores.
- **Order.** Status before bubble, so `running: false` always means settled or idle. Turn start flips the card to running and clears any stored interaction, concurrently, so it never delays the start.
- **One live stream per conversation.** A previous turn's stream is disposed, never overwritten, since two subscriptions render every frame twice. The per-key send lock (`beginSend` in `stream-registry.ts`) is claimed synchronously before the first await, closing the window in which two near-simultaneous sends both saw an observer as prior and both sent. The loser fails fast with `SEND_IN_FLIGHT_MESSAGE` and its bubble fails (`duplicateSendItem`).
- **Observer handoff.** When an observer holds the conversation, the send goes first and the observer keeps rendering. The cursor is snapshotted before the send, so on a 202 the turn stream resumes from it without losing the echo. A rejected send (the cloud's one-turn gate answering 409) leaves the observer rendering and shows the refusal without settling the conversation as an error, because a turn is visibly running.
- **Ambiguous transport failure.** A send whose `fetch` threw has no engine verdict and the turn may be running. The subscription arbitrates: a nonce echo or running sync proves it started; with no evidence within `SEND_VERDICT_MS` (15 s) it fails with `SEND_LOST_MESSAGE`, which can tell the person to resend because nothing started. A definitive rejection or the caller's abort fails at once. `onAccepted` fires only on a real acceptance, so what the send carried stays the caller's to give back otherwise.
- `STREAM_FAILURE_BUDGET` is 8 consecutive frameless attempts. A hung attempt costs a 45 s idle watchdog, and the gateway holds a request up to 300 s while a pod wakes; a budget of 6 gave up at about 283 s, just before a slow wake would have delivered. When it runs out, the turn settles with the engine's last verdict or product copy, never a raw transport string like WebKit's "Fetch is aborted".
- `randomNonce` (`random-nonce.ts`) degrades from `randomUUID` to `getRandomValues` hex to `Math.random` hex, each guarded, because some embedded runtimes lack both and `randomUUID` throws in an insecure browser context. Uniqueness is all a correlation id needs.

## Holding and resending a refused send

`sendHolding` (`send-hold.ts`) resends three transient refusals without losing the message, always as the same request with the same nonce, so a late acceptance can never double it, and with the bubble pending throughout.

- **Waking** (`isEngineWakingRejection`, exact status and reason pairs, never a bare 502 or 503): resend on `SEND_WAKE_RETRY_DELAYS_MS`, about three minutes, longer than a cold boot and shorter than a long turn's drain.
- **`409 turn running`** (`isTurnRunningRejection`, keyed on the reason as well, because a send's 409 can also be "no provider connected"): the send is held. It resends as soon as the stream shows a turn end (`TurnEndCounter`, whose waiter names the count it saw before sending so an end during the send is not missed), or on the fallback ladder. The fallback matters on the cloud pool, where the claim frees a beat after the terminal frame (4.8 s measured on staging). The base hold is `SEND_TURN_RUNNING_HOLD_MS` (15 minutes), extended by live progress up to the four-hour ceiling plus five minutes (`SendHoldClock`).
- **`503 compute_busy`** (`send-busy.ts`): nothing ran and the gateway never moves it to a standing pod. Resend on the server's hint for up to `SEND_BUSY_WAIT_MS` (10 minutes). Staging load tests on 2026-10-02 and 03 admitted all 11,129 queued sends within 45 s, each refusal already follows the gateway's 60 s queue, and 10 minutes matches the first-response ceiling. After `SEND_BUSY_NOTICE_MS` (15 s) the VM shows `sendWaiting: "busy"`, since nine in ten turns showed first text within 13.4 s. A busy refusal also carries the waking string, so it is checked first.
- While held, the sink folds and settles nothing (`SendHoldState`): every frame belongs to the running turn, and an idle sync is not our turn ending. Once held, only our own nonce echo or a 202 naming our turn binds it, and a stray terminal frame is never adopted, because the previous turn's late `done` would settle ours with an empty reply.

### Stop before acceptance

`PersonStop` (`person-stop.ts`) and `stopUnsent` end a send the engine has not accepted at once, then settle the turn as stopped only after every cancel the person sent has answered. Settling first would let a queued message go out and meet a cancel still in flight. A Stop wins even over a 202 that landed in the same tick, because the engine's cancel stops the turn it took. Callers call `finish` in a `finally`, so a failed cancel settles too.

## Turn identity

`turn-identity.ts` classifies each frame against the sink's adopted turn id:

| frame `turnId` | sink `turnId` | verdict |
|---|---|---|
| absent | any | `ours` (legacy server, best-effort continuation) |
| present | absent | `foreign` (before we know our turn) |
| present | same | `ours` |
| present | different | `boundary` (our turn is over) |

A running sync with an id and no adopted id is `adopt`, but only for an observer's attach or a turn sink whose send was accepted (`classifyRunningSync`). A running turn seen before sending belongs to someone else. On a boundary the sink settles from history and stops; neither mode adopts the new turn.

- `adoptTurnId` (`turn-sink.ts`) is the one funnel for learning the id: the echo, a running sync, a stamped terminal frame after acceptance, a history settle. It stamps the optimistic bubble in turn mode only; an observer stamping an observed turn could mislabel a concurrent send's bubble.
- A 202 binds the sink before any replay (`sendAccepted`), because a pool turn can fail before it echoes. A stamped terminal frame with no adopted id after acceptance is ours, since the one-turn gate leaves no other candidate; dropping it left a turn spinning forever.
- `pre-accept-turn.ts` keeps the running turn's frames seen while the send was out. If the 202 names that turn, they were ours and are replayed in order; without this a turn rendered nothing until its terminal frame. Only a 202 that names its turn can claim them. Failure frames are kept by turn id and survive a new sync, because a pooled setup failure sends one `error` frame and nothing else; the last `MAX_FAILURES` (8) are enough. The kept frames are not capped, because a cap would have to settle a turn whose start was dropped.
- Echoes are never rendered: the optimistic push is the one place a sent prompt enters the feed.

## Settling

### Live frames

`turn-settle.ts` and `turn-frames.ts` settle on a terminal frame for our turn.

- `finishErr` treats a Stop and a logged-out provider as handled: an invisible final stops the progress line, an `error` status clears loading, and the card lands on `needs_you`. A logged-out provider refuses the send itself (409), so it settles as the typed `unauthenticated` card carrying the refused prompt for "Send again". A message-driven card would auto-dismiss on reconnect and strand the undelivered prompt.
- `failsSend` fails the bubble only when the send never reached the engine (`delivered === false`), never on a Stop.
- A typed provider failure settles as its card, with whatever streamed finalized above it so the card is the last thing in the transcript. A late extra `provider_error` only refreshes the card.
- `accountBlockedCard` (`account-blocked-refusal.ts`): `provider_account_blocked` means the credential is intact but the provider blocks the account (Copilot billing locked). It settles as `unauthenticated` with cause `billing_locked`, so no sign-in is offered.
- `finishSetupError` (`turn-notices.ts`): a pooled turn that failed before provider work fails the bubble like an undelivered send, because nothing was saved and the 202 proved only that a worker answered.

### From history

When the terminal frame is lost, history is the source, because it is complete once a turn ends.

- `settleFromHistory` with a known `turnId` adopts the record that concludes that turn (`turnReply` in `conclusive-reply.ts`: the last assistant message under the id, since a compaction marker and a re-run can add more). No such record means the turn died before persisting, and it settles with the server's dead-turn copy (`TURN_DIED_MESSAGE`, the same text as `packages/host/src/turn/relay-dialect.ts`), never an empty "completed".
- Without an id, a legacy history uses the trailing assistant message gated by `guard`. Its known weakness: two identical prompts in a row can adopt the previous reply. A native compaction marker concludes nothing, because it is written mid-turn before the reply exists.
- `adoptReply` (`adopt-reply.ts`) routes a persisted `stopped` reply through the same `finishErr` as a live Stop, ahead of any interaction, because a stopped turn must never render a card. An `interrupted` reply renders the restart line, unless `interrupted.resumed`, which settles neutrally. Reasoning is adopted only when nothing streamed live. A persisted interaction is adopted before `finishOk` so the recovered settle shows the card the missed `done` would have, guarded against an older build's interaction shape. `foldPersistedTools` adds tool rows no live frame pushed.
- A failed history reload surfaces as a system message and settles from the streamed accumulation, so the UI never hangs (`reloadAndSettle`).

### The pre-settled poll

A turn can finish before the subscription's first sync, leaving no frames to replay and the card stuck on running. `PresettlePoll` (`presettle-poll.ts`) arms on acceptance alone, after `PRESETTLED_POLL_MS` (1.5 s). It used to also need a fresh idle sync, but an instantly failing turn on a flaky hop could deliver no frame at all, and the turn spun until the reconnect budget ran out.

The poll is conclusive-only: `presettleFromHistory` settles only on a reply for our turn id (or a guard-accepted legacy reply), otherwise re-arms. It must never call the fall-through `settleFromHistory`, whose no-reply branch would error a healthy slow turn. A running sync cancels it. A 404 backs off up to `PRESETTLED_GONE_MAX_POLL_MS` and after `PRESETTLED_GONE_MS` (2 minutes) settles as `turn_unconfirmed`, which keeps the bubble's state because nothing proves it was not saved. That bound is a backstop; the kept setup-error frame is the real fix. Settling only closes this client's stream.

### Observers

`observeConversation` (`observe-stream.ts`) attaches when a chat's history loads, to render a turn left running by another client. An idle sync closes it. A fatal refusal (401, 403, 404, 410) or an exhausted budget disposes silently when nothing is on screen, and settles visibly when a turn was mid-render, so the card never freezes. A throwing frame handler is a bug and surfaces on the feed.

## Errors and copy

- `turnErrorMessage` and `engineVerdictMessage` (`turn-errors.ts`) show the engine's authored `{ error }` copy and nothing else. A transport failure, a watchdog abort or a thrown bug becomes `TURN_FAILED_MESSAGE` and the raw cause goes to the log. Status codes and JSON never reach the chat.
- `STOPPED_BY_USER` is the one copy of the runtime's stop line; `isStoppedByUser` matches it and the history fold replays it so a reload reads the same.
- `EngineNoticeKind` lets surfaces localize system lines by kind; the English text is a default.
- `TurnErrorClass` (`turn-error-class.ts`, a dependency-free subpath) records why a turn ended in `error`, from the settle's typed input, never from the chat copy, which deliberately hides the cause. `TurnErrorDisposition` maps each to `intended` (Stop), `handled` (explained with copy and a next step) or `failure`. `agent_too_large` and `agent_setup_failed` are separate because one is unretryable and sized by the agent's data and the other is a transient worker fault. `turn_unconfirmed` is its own class so dashboards tell "lost after the 202" from a thrown bug. `provider_unknown` is a failure because its copy is generic; other typed provider cards are handled. `NOTICE_CLASS` is exhaustive so a new notice kind fails to compile until classed.
- `SessionStatusOrigin` marks a status `sent` or `observed`, so one looping background run on one device does not read as the whole fleet failing.
- `turnFailureReport` reports setup failures and lost terminals, which are unexpected, while the chat line is the person's whole surface.
- `messageLimitRefusal` reads the `message_limit` 429 from all three transports' error shapes.

## History fold

`historyToFeed` (`history.ts`, `history-assistant.ts`) mirrors the live output so a reload renders what a watcher saw: one `assistant_text` per reply, reasoning before tools, a file-change summary after the text, the provider failure card after everything, dividers for a provider switch, `/clear` and compaction, and usage as an invisible `final_result`. A compaction summary is the model's own memory, so only the divider shows. A hidden auto-continue prompt is model input the person never wrote and is folded away here so no binder renders the marker. A stored `displayText` is what the bubble shows.

## Reads that a turn overtook

`readPastOwnTurns` (`read-past-own-turns.ts`) refuses to seed a history read that may predate a turn this client started. The registry counts turns per key (`noteTurnStart`, noted before the bubble); a read that went out before a start, or while the send was not yet accepted, is taken again once that turn lets go. A new chat answers not-found until the host stores its first prompt, which is not a verdict either. Each pass waits out a whole turn, so it cannot storm. `joinInFlight` (`single-flight.ts`) shares one read per chat; a join marks it dirty and it runs once more, because the joiner may stand for a change the running read missed.

## Stream registry

`StreamRegistry` (`stream-registry.ts`) is per owner (one SDK or the web adapter), passed explicitly. It used to be a package singleton, and `disposeAll` on one owner aborted the other's streams. `ownsAnyTurn` is what the desktop updater asks before an install would pull the app out from under a send. `disposeAll` is wired to the adapter's teardown and settles nothing, because the UI is going away.

## First response

`FirstResponseClock` (`first-response.ts`) reports once per turn this client sent: the first visible text, or how the turn ended without it, plus the first activity of any kind (text often waits behind several tool round trips). It is fed only by its own turn's frames. `FIRST_RESPONSE_TIMEOUT_MS` (10 minutes) matches the gateway's latency ingest clamp, so a censored span means the same on both sides. A torn-down stream reports nothing, and the timer never keeps a process alive.

## Prewarm while typing

`draft-prewarm.ts` and `draft-typing.ts` (subpaths `@houston/sdk/draft-prewarm`, `@houston/sdk/draft-typing`) ready the sandbox a send will run in, only where `Capabilities.conversationPrewarm` is true. A prewarm starts after `PREWARM_TYPING_MS` (1.5 s) of typing without a gap over `PREWARM_TYPING_GAP_MS` (1 s), because a sandbox nobody sends to is pure cost. While the gateway holds it (`holdMs`, 20 s), a keystroke at least `PREWARM_REFRESH_MS` (10 s) after the last request extends it.

- Typing starts on the monotonic clock, which no adjustment lengthens, and a hold ends when either clock passes it, so a sleep or a clock set forward ends it early, never late.
- A new chat has no id until its first send, so the id is minted here and claimed by that send (`claimNewConversationId`); only a send to the same conversation reuses the sandbox. A hosted bearer rotation rebuilds the SDK mid-typing, so the state is handed to the replacement as is.
- A routine's chat is never prewarmed. A failed prewarm is not retried; the next keystroke past the interval asks again. The route is a gateway control route, so it rides the module HTTP seam (`conversation-prewarm.ts`).

## Imports

`conversation-imports.ts` writes lines said elsewhere into a chat as real history (the AI Manager's scripted onboarding).

- Each import is an outbox entry written before sending and crossed off when the runtime answers (`conversation-import-outbox.ts`). Sending twice is safe because the runtime writes an `importId` once. A 400, 403 or 404 is final and crossed off. A newer entry under the same id replaces the older, because a resumed onboarding owes a shorter transcript. Edits to the owed list are chained so two finishing together never drop each other.
- `retryPendingImports` sends only one agent's entries; a shared device holds other people's, which are not this person's to send.
- An import aborted while the page was leaving is neither landed nor failed (`conversation-import-abort.ts`). Reading it as failed once finished onboarding from a dying page and left an empty manager chat after reload. `conversation-import-hold.ts` keeps its promise pending and resends when the page proves alive: on `onLive`, or when its own timer fires, because timers do not run on a dead page. It backs off from `RESEND_AFTER_MS` (3 s) to `RESEND_MAX_MS` (30 s). Only the host's answer settles a hold.

## Attachments and controls

- `attachment-text.ts` is the SDK's copy of the attachment marker, byte for byte the desktop encoder (`app/src/lib/attachment-message.ts`) and decoder (`ui/chat/src/attachment-message.ts`), pinned by its test. Key order `path, name` is part of the bytes. No `>` may reach the marker JSON, because nested `-->` would close the comment early. Decoding never throws.
- The upload request belongs to the files module (`packages/sdk/src/modules/files/uploads.ts`), so `relPath` reaches the host the same way from both paths. `AttachmentTooLargeError` types the 413.
- `conversation-controls.ts` holds the one-shot controls (stop, mode, dismiss, rewind, import, prewarm): each one request, no stream or VM fold, so the web adapter binds them unchanged. A dismiss answered `409 turn running` returns `turn_running` instead of throwing: the card was already retired by a running turn, and the caller must not clear a persisted copy that the turn's own settle will write. `not_interaction_owner` (403) means only the member whose message raised the card may dismiss it.
- `noticeEndsTurn` (`notice-ends-turn.ts`, its own subpath): a restart notice does not end the turn; every other line does.
