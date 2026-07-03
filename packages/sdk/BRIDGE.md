# The native bridge contract

How a native host (a SwiftUI or Jetpack Compose app that embeds `@houston/sdk`
inside a JavaScript engine — JavaScriptCore on iOS, Hermes on Android) talks to
the SDK. iOS and Android engineers build to **this document alone**: it fixes
the message shapes, the ordering guarantees, the error surfaces, and the
versioning discipline. Everything here is plain JSON; nothing crosses the bridge
that is not JSON-serializable.

This is the contract. The thin JS-side **dispatcher** that implements it (wraps
`HoustonSdk.dispatch` / `subscribe` / `on` and marshals strings over the pipe)
is on the roadmap — this document is the interface it will satisfy, and the
native side may be written against it before that code lands.

---

## 1. Transport

The embedder provides one **bidirectional, message-oriented string pipe**. On
iOS this is a `JSValue` function pair over `JSContext`; on Android a
`@JavascriptInterface` / `WebMessagePort` pair over the Hermes/WebView bridge.
The SDK is agnostic to which.

Two primitives, both carrying exactly **one JSON value serialized to one UTF-8
string** per call:

| Direction | Primitive | Who calls it |
| --- | --- | --- |
| host → SDK | `receive(message: string): void` | native host, to deliver an inbound message |
| SDK → host | `send(message: string): void` | the SDK, to deliver an outbound message |

The pipe is **whole-message**: `receive`/`send` are never handed a partial or
concatenated frame. There is no newline/length framing to parse — the embedder
delivers each string as one message. SSE chunking, reconnect, and byte-level
resume all live *below* the bridge inside `@houston/runtime-client` and are
invisible to the host (see §7).

`send` is **fire-and-forget and asynchronous in spirit**: the host's `send`
implementation must only marshal the string to its native side and return. It
must **not** call `receive` synchronously from within `send` (see §8).

---

## 2. Message envelopes

Every message is a JSON object with a `kind` discriminator. Types below reuse
the kernel contract verbatim:

```ts
// packages/sdk/src/bridge.ts (roadmap) — the wire union this doc specifies
import type { CommandEnvelope, CommandResult } from "../commands";
import type { SdkEvent } from "../store";

// host → SDK
export type BridgeInbound =
  | { kind: "command"; envelope: CommandEnvelope }
  | { kind: "subscribe"; sub: string; scope: string }
  | { kind: "unsubscribe"; sub: string };

// SDK → host
export type BridgeOutbound =
  | { kind: "ready"; v: number }
  | { kind: "result"; result: CommandResult }
  | { kind: "subscribed"; sub: string; scope: string; snapshot?: unknown }
  | { kind: "snapshot"; sub: string; scope: string; snapshot: unknown }
  | { kind: "event"; event: SdkEvent }
  | { kind: "fatal"; reason: string; message: string };
```

### Commands (request / reply, correlated by `id`)

Host sends `{ kind: "command", envelope }` where `envelope` is a
`CommandEnvelope { id, type, payload? }`. The `id` is **host-minted and
unique** (a UUID or a monotonic counter string). The SDK routes `type` to the
same handler the typed facade method uses (`HoustonSdk.dispatch`) and replies
with exactly one `{ kind: "result", result }` whose `result.id === envelope.id`.
`CommandResult` is `{ id, ok: true, value? }` on success or
`{ id, ok: false, error: { message, status? } }` on failure (§5). Every command
gets exactly one result; the host correlates by `id`.

`type` strings are owned by the SDK's modules, not by the bridge — the bridge
routes any string opaquely. The authoritative command vocabulary is the set the
modules register; the flows in §6 use the representative names below.

### Subscriptions (lifecycle + change pushes)

- Host sends `{ kind: "subscribe", sub, scope }`. `sub` is a **host-minted
  subscription id** (unique per live subscription; the correlation handle for
  later pushes and for `unsubscribe`). `scope` is a store scope string:
  `"connection"`, `"agents"`, or `"conversation/<id>"`.
- SDK replies **once, immediately**, with
  `{ kind: "subscribed", sub, scope, snapshot? }`. `snapshot` carries the
  current `getSnapshot(scope)`; it is **omitted** when that is `undefined`
  (nothing published yet). Subscribing is also what *activates* a lazy scope —
  e.g. the first subscriber on `conversation/<id>` starts that conversation's
  live stream underneath (§7).
- Thereafter, every `publish(scope, snapshot)` the SDK makes for that scope is
  pushed as `{ kind: "snapshot", sub, scope, snapshot }` — one message **per
  matching subscription**. `snapshot` here always carries a value (publish
  never publishes `undefined`).
- Host sends `{ kind: "unsubscribe", sub }` to stop. After it, no further
  `snapshot` for that `sub` is sent. Unsubscribing the last subscriber on a
  lazy scope tears down the underlying stream. `unsubscribe` for an unknown
  `sub` is a no-op (idempotent). There is no reply to subscribe/unsubscribe
  other than the `subscribed` frame.

Multiple `sub`s may target the same `scope`; each gets its own `subscribed`
and its own `snapshot` stream. Snapshots are **whole-value replacements**, never
diffs or splices — the host renders the latest and drops the previous (§8).

### One-shot events

`{ kind: "event", event }` carries an `SdkEvent { type, scope?, data? }`
delivered from `HoustonSdk.on(cb)`. Events are **not correlated** to any command
or subscription; they are point-in-time signals (an approval request, a session
error). `scope` names the affected scope when the event is scoped. The bridge
forwards every event verbatim; `type` semantics are owned by the emitting
module.

### Handshake

On construction the dispatcher posts `{ kind: "ready", v: 1 }` exactly once.
`v` is the bridge protocol major version (§4). The host waits for `ready`
before sending its first inbound message, then attaches the session (§6.1).

---

## 3. Ordering guarantees

- Exactly **one `result` per command**, and the host may assume no result
  arrives before it sends the command.
- For one `sub`: `subscribed` precedes every `snapshot`; `snapshot`s arrive in
  publish order; none arrive after the `unsubscribe` is received.
- Across the whole pipe, messages are delivered in the order the SDK `send`s
  them (single JS thread, §8). A command's `result` and the `snapshot`s its
  handler triggers may interleave, but each stream is internally ordered — e.g.
  `conversation/send` may push the user-message snapshot *before* its own
  `result`. Do not assume a command's side-effect snapshots come after its
  result.

---

## 4. Versioning — additive JSON, exactly like protocol v3

The bridge follows the same discipline as Houston's wire protocol v3
(`packages/protocol`): **backward- and forward-compatible by construction**.

**The rule:**

1. **Consumers ignore unknown fields.** A native host must not fail when it sees
   an object field it does not recognize.
2. **Producers only add *optional* fields.** New data is additive; existing
   fields never change type or meaning.
3. **Discriminated unions only gain members.** New `kind`, new command `type`,
   new `SdkEvent.type`, new error `kind` — a consumer that meets an unknown
   discriminant treats it as inert (ignore the message / render nothing) rather
   than crashing.

Under this rule the SDK and a native host may run **different minor versions**
indefinitely. The single `v` in the `ready` handshake changes **only on a
breaking change** — removing/renaming a field, changing a field's type, or
altering the meaning of an existing `kind`. A breaking change requires a new
bridge major: bump `v`, and the host must refuse to attach (surface an
"update required") when `ready.v` exceeds the major it was built for. There is
no in-band renegotiation — `v` is a compatibility gate, not a handshake dialog.

---

## 5. Error surfaces

Three distinct surfaces. Keep them separate in host code.

**1. Command errors** — a single command failed. Delivered as the command's own
`{ kind: "result", result: { id, ok: false, error: { message, status? } } }`.
`status` is the upstream HTTP status when the failure was an engine/gateway
response (e.g. `404` unknown conversation, `401` rejected token). Scope: the one
command. Recovery: host-specific (retry, surface a message, re-attach on `401`).

**2. Stream errors** — a failure *within* a conversation's turn. These are
**not** transport failures; the bridge stream never breaks. A model/auth/rate
failure folds into the conversation's snapshot: the turn ends
(`live.running: false`) and the last assistant message carries a typed
`providerError` (`packages/protocol/src/provider-error.ts`) — e.g.
`{ kind: "unauthenticated", cause: "token_expired" }` for a lapsed *provider*
credential, `{ kind: "rate_limited", retry_after_seconds }`, etc. The host reads
it off the pushed snapshot and renders the matching inline card. This mirrors
wire.ts: `provider_error` is terminal but a normal terminal frame still settles
the turn, so the snapshot is always left consistent.

**3. Fatal session errors** — the whole SDK session is unusable. Delivered as
`{ kind: "fatal", reason, message }`. The canonical case is
`reason: "tokenExpired"`: the Houston (Supabase) session token the host attached
has lapsed, so the gateway rejects every request with `401`. On a `fatal` the
host must stop issuing commands, obtain a fresh session token, and re-attach
(§6.6). The SDK also flips the `connection` scope snapshot to unauthenticated,
so a host subscribed there sees it both ways. A `fatal` is **not** correlated to
any command; it can arrive at any time.

> **Provider token-expired vs. session token-expired.** A *provider* credential
> lapsing (Claude/Codex OAuth) is a **stream error** — per-conversation, in the
> feed's `providerError`, recovered by reconnecting that provider. The
> *Houston session* token lapsing is a **fatal session error** — whole-session,
> `kind: "fatal"`, recovered by re-attaching. They are different failures with
> different blast radii; do not conflate them.

---

## 6. Concrete flows

All ids below are illustrative. Module command `type`s and `SdkEvent.type`s are
owned by the modules; the **envelope shapes** (`kind`, correlation by `id`/`sub`)
are the normative contract.

### 6.1 Attach the session token

Always first, after `ready`. Sets the bearer the runtime-client sends on every
request. Re-send `session/attach` at any time to rotate the token.

```json
→ { "kind": "command",
    "envelope": { "id": "c1", "type": "session/attach",
                  "payload": { "token": "eyJhbGciOi…supabase-jwt" } } }
← { "kind": "result", "result": { "id": "c1", "ok": true } }
```

### 6.2 List agents (command result + subscription push)

Subscribe to the `agents` scope for live updates, and issue the command that
loads them. The command returns the list as its value; the same list is
published to the scope, so a late subscriber is caught up too.

```json
→ { "kind": "subscribe", "sub": "s-agents", "scope": "agents" }
← { "kind": "subscribed", "sub": "s-agents", "scope": "agents" }
→ { "kind": "command", "envelope": { "id": "c2", "type": "agents/list" } }
← { "kind": "result", "result": { "id": "c2", "ok": true,
      "value": [ { "id": "ag_1", "name": "Bookkeeper",
                   "folderPath": "…/Bookkeeper", "configId": "cfg_a",
                   "color": "#7C3AED", "createdAt": "2026-06-30T10:00:00Z" } ] } }
← { "kind": "snapshot", "sub": "s-agents", "scope": "agents",
    "snapshot": [ { "id": "ag_1", "name": "Bookkeeper", "folderPath": "…/Bookkeeper",
                    "configId": "cfg_a", "color": "#7C3AED",
                    "createdAt": "2026-06-30T10:00:00Z" } ] }
```

### 6.3 Open a conversation and receive the feed snapshot

`conversation/open` loads history and returns the **feed snapshot** as its
value; subscribing to `conversation/<id>` starts the live stream underneath and
delivers subsequent updates. The feed snapshot is the persisted history plus the
in-flight `live` block (running/partial/seq/turnId — see §7).

```json
→ { "kind": "subscribe", "sub": "s-conv", "scope": "conversation/cv_42" }
← { "kind": "subscribed", "sub": "s-conv", "scope": "conversation/cv_42",
    "snapshot": { "id": "cv_42", "title": "Q2 books",
      "messages": [
        { "role": "user", "content": "Reconcile June", "ts": 1751000000000, "turnId": "t_9" },
        { "role": "assistant", "content": "Done — 3 txns matched.", "ts": 1751000004000,
          "turnId": "t_9", "usage": { "context_tokens": 8123, "output_tokens": 210, "cached_tokens": 4096 } } ],
      "live": { "running": false, "partial": "", "seq": 12 } } }
→ { "kind": "command",
    "envelope": { "id": "c3", "type": "conversation/open", "payload": { "id": "cv_42" } } }
← { "kind": "result", "result": { "id": "c3", "ok": true,
      "value": { "id": "cv_42", "title": "Q2 books", "messages": [ … ],
                 "live": { "running": false, "partial": "", "seq": 12 } } } }
```

If the underlying stream could not honor a resume cursor it re-syncs (wire.ts
`resync: true`); the host simply receives a fresh full `snapshot` and replaces
its state — never a splice (§7).

### 6.4 Send a message and stream updates through settle

`conversation/send` returns `ok` once the message is accepted. The turn's
progress arrives as `snapshot` pushes on the open subscription: the user message,
growing `live.partial` (assistant text deltas), then a settled snapshot
(`running: false`) with the completed assistant message appended.

```json
→ { "kind": "command", "envelope": { "id": "c4", "type": "conversation/send",
      "payload": { "id": "cv_42", "text": "Now email the summary", "nonce": "n-88" } } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/cv_42",
    "snapshot": { "id": "cv_42", "title": "Q2 books",
      "messages": [ …, { "role": "user", "content": "Now email the summary",
                         "ts": 1751000100000, "turnId": "t_10" } ],
      "live": { "running": true, "partial": "", "seq": 13, "turnId": "t_10" } } }
← { "kind": "result", "result": { "id": "c4", "ok": true } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/cv_42",
    "snapshot": { "…messages…": "…", "live": { "running": true, "partial": "Drafting the",
                  "seq": 15, "turnId": "t_10" } } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/cv_42",
    "snapshot": { "…messages…": "…", "live": { "running": true,
                  "partial": "Drafting the email now…", "seq": 18, "turnId": "t_10" } } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/cv_42",
    "snapshot": { "id": "cv_42", "title": "Q2 books",
      "messages": [ …, { "role": "assistant", "content": "Drafting the email now… Sent.",
                         "ts": 1751000108000, "turnId": "t_10",
                         "usage": { "context_tokens": 8590, "output_tokens": 96, "cached_tokens": 8123 } } ],
      "live": { "running": false, "partial": "", "seq": 21 } } }
```

`live.turnId` is `t_10` throughout this turn (§7). Note the `result` interleaves
with snapshots — the user-message push preceded it here (§3).

### 6.5 Approval-needed event

A tool needs the user's approval mid-turn. The SDK emits a one-shot scoped
`event`; the host prompts the user and answers with a command. The `data` shape
is owned by the approvals module (representative below); the `event` envelope is
the contract.

```json
← { "kind": "event", "event": { "type": "approval/needed", "scope": "conversation/cv_42",
      "data": { "approvalId": "ap_5", "turnId": "t_10", "tool": "send_email",
                "summary": "Email June summary to owner@acme.com" } } }
→ { "kind": "command", "envelope": { "id": "c5", "type": "approval/resolve",
      "payload": { "approvalId": "ap_5", "decision": "approve" } } }
← { "kind": "result", "result": { "id": "c5", "ok": true } }
```

The turn stays `running` while awaiting the decision; after `approve` the stream
resumes and settles as in §6.4.

### 6.6 Token-expired flow (fatal, then re-attach)

The Houston session token lapses. The in-flight command fails `401`, and the
SDK emits a `fatal`. The host obtains a fresh token and re-attaches; existing
subscriptions stay registered and resume pushing once auth is restored.

```json
→ { "kind": "command", "envelope": { "id": "c6", "type": "agents/list" } }
← { "kind": "result", "result": { "id": "c6", "ok": false,
      "error": { "message": "unauthorized", "status": 401 } } }
← { "kind": "fatal", "reason": "tokenExpired",
    "message": "Houston session token expired; re-attach to continue." }
   // … host refreshes the Supabase session …
→ { "kind": "command", "envelope": { "id": "c7", "type": "session/attach",
      "payload": { "token": "eyJhbGciOi…new-jwt" } } }
← { "kind": "result", "result": { "id": "c7", "ok": true } }
```

Contrast with a *provider* token expiring (§5): that arrives as a
`providerError` inside a conversation snapshot, not a `fatal`.

---

## 7. Feed semantics — turnId / seq / resume (cross-ref `packages/protocol/src/wire.ts`)

The conversation feed snapshot's `live` block projects the runtime-client
`ConversationSnapshot`:

- **`turnId`** — the id of the **running** turn (`wire.ts` `WireFrame.turnId`),
  minted server-side at turn start and stamped on every turn-scoped frame and on
  the persisted `ChatMessage`s. It lets the host tell **its own turn from
  another writer's** (a teammate, a second tab, a routine) instead of splicing
  foreign output into its optimistic UI. Present while `running`, cleared on
  settle. Each `ChatMessage.turnId` matches the live turn it belonged to.
- **`seq`** — the stream watermark: the seq of the last frame folded in
  (`wire.ts` per-conversation, strictly monotonic, process-lifetime). The host
  treats it as **opaque** — it may ignore it entirely. It does **not** manage
  resume cursors.
- **Resume is invisible to the host.** A dropped SSE connection is healed
  beneath the bridge by `streamEventsResumable`. Frames inside the replay window
  are re-sent with no gap or duplicate; a cursor too old to serve produces a
  fresh sync (`wire.ts` `resync: true`). Either way the host sees only a
  corrected `snapshot` — **always a full replacement, never a partial splice.**
  The host must therefore treat every `snapshot` as the complete, authoritative
  state of that scope and never attempt to reconcile deltas itself.

---

## 8. Threading & reentrancy (for embedders)

- **One JS thread.** JavaScriptCore and Hermes run the SDK on a single thread.
  Every `receive` call, every handler, every `send` runs on that thread. There
  is no internal locking because there is no concurrency to guard — but it means
  the host must call `receive` from **one** thread (or serialize its calls). Do
  not call `receive` concurrently from two native threads.

- **Snapshots are immutable JSON.** The SDK never mutates a snapshot after
  publishing it; `publish` swaps in a fresh value. A `snapshot`/`subscribed`
  payload is safe to hand to the native UI thread as-is (after your JSON→native
  decode). Keep the latest, discard the previous — earlier snapshots are stale,
  not incremental.

- **Do not re-enter `receive` from `send`.** Processing one inbound message may
  cause the SDK to `send` several outbound messages **synchronously** (a
  `subscribe` emits `subscribed` immediately; a `conversation/send` may push a
  snapshot before its `result`). The host's `send` implementation must only
  enqueue/marshal the string to the native side and return promptly. It must
  **not** synchronously call `receive` from inside `send`. Doing so would nest a
  new inbound dispatch inside the current one on the same stack: because state
  is single-threaded and snapshots are immutable, nothing tears — but delivery
  order becomes the nesting order rather than the intended queue order, which
  will surprise you. Rule: **`send` marshals and returns; inbound work is always
  driven from a fresh call stack** (the native run loop / dispatch queue), never
  re-entrantly from an outbound callback.

- **Backpressure.** The pipe has none at this layer. If the host cannot keep up
  with `snapshot` pushes it should coalesce on its side — since each snapshot is
  a full replacement, dropping all but the latest per `sub` is always correct.
