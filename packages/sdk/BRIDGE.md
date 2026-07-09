# The native bridge contract

How a native host (a SwiftUI or Jetpack Compose app that embeds `@houston/sdk`
inside a JavaScript engine — JavaScriptCore on iOS, Hermes on Android) talks to
the SDK. iOS and Android engineers build to **this document alone**: it fixes
the message shapes, the ordering guarantees, the error surfaces, and the
versioning discipline. Everything here is plain JSON; nothing crosses the bridge
that is not JSON-serializable.

This is the contract. The thin JS-side **dispatcher** that implements it (wraps
`HoustonSdk.dispatch` / `subscribe` / `on`, marshals strings over the pipe, and
backs `fetch`/`storage` natively) has **shipped** in `packages/sdk/src/bridge/`,
along with the embeddable IIFE bundle (`build:bridge`). §2.1, §9, and §10 are the
normative additions that landed with it; the base envelopes are unchanged.

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
// packages/sdk/src/bridge/wire.ts — the wire union this doc specifies (SHIPPED)
import type { CommandEnvelope, CommandResult } from "../commands";
import type { SdkEvent } from "../store";

// host → SDK
export type BridgeInbound =
  | { kind: "configure"; baseUrl: string; native?: NativePorts } // §2.1
  | { kind: "command"; envelope: CommandEnvelope }
  | { kind: "subscribe"; sub: string; scope: string }
  | { kind: "unsubscribe"; sub: string }
  // native port replies (correlated to an SDK-minted `id`) — §9
  | { kind: "fetch/response"; id: string; status: number; ok: boolean }
  | { kind: "fetch/chunk"; id: string; bytesBase64: string }
  | { kind: "fetch/done"; id: string }
  | { kind: "fetch/error"; id: string; message: string }
  | { kind: "storage/result"; id: string; value?: string | null };

// SDK → host
export type BridgeOutbound =
  | { kind: "ready"; v: number }
  | { kind: "result"; result: CommandResult }
  | { kind: "subscribed"; sub: string; scope: string; snapshot?: unknown }
  | { kind: "snapshot"; sub: string; scope: string; snapshot: unknown }
  | { kind: "event"; event: SdkEvent }
  | { kind: "fatal"; reason: string; message: string }
  | { kind: "error"; message: string; detail?: unknown } // §5, protocol-level
  // native port requests (host replies correlated by `id`) — §9
  | { kind: "fetch/start"; id: string; url: string; method: string;
      headers: Record<string, string>; body?: string }
  | { kind: "fetch/abort"; id: string }
  | { kind: "storage/get"; id: string; key: string }
  | { kind: "storage/set"; id: string; key: string; value: string }
  | { kind: "storage/delete"; id: string; key: string }
  | { kind: "log"; level: "debug" | "info" | "warn" | "error";
      message: string; fields?: Record<string, unknown> };

/** Which capability ports the host services natively over the pipe (§9). */
export interface NativePorts { storage?: boolean; fetch?: boolean }
```

> **Status.** This union is SHIPPED in `packages/sdk/src/bridge/` (the dispatcher
> `createBridge`, the native-port marshalling, and the embeddable-bundle entry).
> The four base envelopes above match the original contract verbatim; the
> `configure` / `error` / `fetch/*` / `storage/*` / `log` members and the
> `NativePorts` shape were added additively when the dispatcher landed — all
> optional-by-construction, so a host built against the base four is unaffected
> (§4). §2.1 (configure), §9 (native ports), and §10 (host polyfills) below are
> the new normative sections.

### 2.1 Configure — the first inbound message

The dispatcher constructs nothing until the host declares where the engine
lives. `configure` is therefore the **first** message the host sends, before
any command or subscription:

```json
→ { "kind": "configure", "baseUrl": "http://127.0.0.1:4317",
    "native": { "storage": true } }
← { "kind": "ready", "v": 1 }
```

- `baseUrl` (required) roots every engine request.
- `native` (optional) declares which ports the host backs over the pipe.
  `storage` defaults `true` (host-backed via `storage/*`); `false` makes the
  bridge use an in-memory store (tokens do not survive a restart). `fetch` is
  always native — an embedded engine has no HTTP stack — and a `false` is
  ignored.
- The dispatcher builds the ports, constructs the SDK, wires the event channel,
  and replies `ready` **once**. A second `configure` is refused with an `error`.
- **Ordering note.** Constructing the SDK hydrates the persisted token, so the
  first `storage/get` (§9) may go out *before* `ready`. A host must be ready to
  service port requests as soon as it has sent `configure`.

> **Deviation from the original §2 handshake.** The roadmap draft posted `ready`
> "on construction," before any inbound message. Reality: the dispatcher needs
> `baseUrl` to construct the SDK, so `ready` is the **reply to `configure`**, not
> an unprompted greeting. Everything else about `ready` (posted exactly once,
> `v` is the compatibility gate) is unchanged.

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
  `"connection"`, `"agents"`, or `"conversation/<agent>/<conversation>"` —
  conversation scopes are **agent-qualified** (both segments URI-encoded)
  because conversation ids are unique only within one agent; hosts never build
  the encoding themselves, they call `conversationScope(agentId,
  conversationId)` (ADR-0001 in the repo root).
- SDK replies **once, immediately**, with
  `{ kind: "subscribed", sub, scope, snapshot? }`. `snapshot` carries the
  current `getSnapshot(scope)`; it is **omitted** when that is `undefined`
  (nothing published yet).

  > **Deviation — subscribing does NOT activate a lazy scope.** The roadmap
  > draft said the first subscriber on `conversation/<agent>/<conversation>` starts that
  > conversation's stream underneath. In the shipped SDK `subscribe` is a
  > *passive* read attachment: it delivers the initial snapshot and forwards
  > later publishes, but it starts no stream. To make a conversation stream, the
  > host issues a command — `turns/send` (start a turn) or `turns/observe`
  > (attach to a turn started elsewhere); those publish to the scope and the
  > subscriber then receives the pushes. Subscribe first so the initial frames
  > are not missed, then send the activating command (see §6.3/§6.4).
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

Four distinct surfaces. Keep them separate in host code. (The fourth,
**protocol errors**, is new — added with the dispatcher.)

**0. Protocol errors** — an inbound message the dispatcher could not act on and
could not correlate to a command or subscription. Delivered as
`{ kind: "error", message, detail? }`. Causes: a non-JSON string, an object with
no string `kind`, `subscribe` missing `sub`/`scope`, `unsubscribe` missing
`sub`, `subscribe`/`command` before `configure`, or a second `configure`. It is
**never fatal** and correlates to nothing — it just reports that one message was
rejected. A **malformed command** does *not* use this surface: it still gets a
`result` (`ok:false`, `"invalid command envelope"`) correlated by whatever `id`
was extractable (§2), so command replies stay uniform. An **unknown `kind`** is
*not* an error either — it is inert per §4 (ignored, no reply), so a newer host
speaking a future member never trips the old dispatcher.


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

> **Mechanism.** Inside the SDK, token expiry is an `SdkEvent`
> (`type: "session/tokenExpired"`) on the event channel. The dispatcher
> translates that ONE event type into `{ kind: "fatal", reason: "tokenExpired" }`
> and forwards every other event verbatim as `{ kind: "event", event }`. A host
> therefore never sees a `session/tokenExpired` `event` — it always arrives as a
> `fatal`.

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
value; subscribing to `conversation/<agent>/<conversation>` starts the live stream underneath and
delivers subsequent updates. The feed snapshot is the persisted history plus the
in-flight `live` block (running/partial/seq/turnId — see §7).

```json
→ { "kind": "subscribe", "sub": "s-conv", "scope": "conversation/ag_1/cv_42" }
← { "kind": "subscribed", "sub": "s-conv", "scope": "conversation/ag_1/cv_42",
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
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/ag_1/cv_42",
    "snapshot": { "id": "cv_42", "title": "Q2 books",
      "messages": [ …, { "role": "user", "content": "Now email the summary",
                         "ts": 1751000100000, "turnId": "t_10" } ],
      "live": { "running": true, "partial": "", "seq": 13, "turnId": "t_10" } } }
← { "kind": "result", "result": { "id": "c4", "ok": true } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/ag_1/cv_42",
    "snapshot": { "…messages…": "…", "live": { "running": true, "partial": "Drafting the",
                  "seq": 15, "turnId": "t_10" } } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/ag_1/cv_42",
    "snapshot": { "…messages…": "…", "live": { "running": true,
                  "partial": "Drafting the email now…", "seq": 18, "turnId": "t_10" } } }
← { "kind": "snapshot", "sub": "s-conv", "scope": "conversation/ag_1/cv_42",
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
← { "kind": "event", "event": { "type": "approval/needed", "scope": "conversation/ag_1/cv_42",
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

### 6.7 Attach files to a message (composer attachments)

Two steps, entirely on the command path — **no new envelope kinds**.

**Step 1 — upload.** `turns/attachments/save` uploads the user's dropped files
INTO the agent's workspace and returns the RELATIVE paths the agent's Read tool
opens. Files land in the agent's visible, durable `uploads/` folder; colliding
names are disambiguated (`report.csv` → `report (1).csv`). `scopeId` is a legacy
per-conversation key the current host ignores — still send it for compatibility
with not-yet-updated cloud pods. `agentId` targets the agent's sandbox (omit for
the single local runtime).

```json
→ { "kind": "command", "envelope": { "id": "c8", "type": "turns/attachments/save",
      "payload": { "agentId": "ag_1", "scopeId": "cv_42",
        "files": [ { "name": "brief.pdf", "contentBase64": "JVBERi0x…" } ] } } }
← { "kind": "result", "result": { "id": "c8", "ok": true,
      "value": { "paths": [ "uploads/brief.pdf" ] } } }
```

The request is capped (100 MB); an oversized upload fails with a **typed**
`AttachmentTooLargeError` surfaced as `{ ok: false, error: { message, status: 413 } }`
— never a silent drop. Missing/empty `files`, a blank file `name`, or a
non-string `contentBase64` fail validation the same way (no `status`).

**Step 2 — send.** Weave the returned paths into the message text with the
SDK-exported pure helper `buildAttachmentText(text, paths, names?)`, then pass
the result as the `turns/send` `payload.text` (§6.4). The helper emits, byte-for-
byte, the desktop composer's format: a hidden `<!--houston:attachments {json}-->`
marker (display metadata) followed by the user's text and a visible model-facing
path block. For feed rendering, `decodeAttachmentText(text)` returns
`{ displayText, attachments: [{ name }] } | null` — the single decode counterpart
so a native shell renders a clean attachment summary instead of the raw path
block. Both helpers are pure JS (no bridge round-trip); import them from
`@houston/sdk`.

```
<!--houston:attachments {"message":"Summarize this","files":[{"path":"uploads/brief.pdf","name":"brief.pdf"}]}-->

Summarize this

[User attached these files. Read them with the Read tool if needed:
- uploads/brief.pdf]
```

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
- **`ts` (optional epoch-ms) — a message/feed-entry timestamp.** Each `messages[]`
  entry carries `ts` (the persisted `ChatMessage.ts`), and the SDK's built-in
  conversation VM stamps the same field on every feed entry it publishes: a
  seeded history frame carries its source message's `ts`; a live push that lacks
  one is stamped with the wall clock when it first appears; a streaming/finalizing
  update keeps the entry's ORIGINAL `ts` (a reply is timed by when its bubble
  opened, not per delta). It is **optional** per §4 — **absent** for a transcript
  written before timestamps existed and for a frame not tied to a message — so a
  host renders relative time only when `ts` is present and never assumes it. It is
  a plain JSON number of milliseconds; do not confuse it with the opaque `seq`
  watermark (which orders frames but is not a clock).
- **`pending` (optional boolean) — an unconfirmed optimistic send.** The SDK's
  built-in conversation VM stamps `pending: true` on the ONE optimistic
  `user_message` it pushes the instant a turn is sent — before the engine has
  acknowledged anything — and **clears** it (strips the field, same feed-entry
  id, a normal snapshot replacement) on the FIRST server evidence for that turn:
  any subsequent pushed feed item, or a `live.running` transition to settled
  (`sessionStatus` `completed`/`error`), whichever comes first. Multiple queued
  optimistic bubbles (send-while-running, resend) each hold their flag until that
  first evidence, which confirms them all at once. Semantics for a host:
  `pending === true` -> not yet confirmed by the engine (render a clock,
  WhatsApp-style); **absent/false** -> confirmed (render a single check). A
  seeded history frame NEVER carries it. It is **optional** per §4 exactly like
  `ts` — a surface that does not render send-state simply ignores it — and it is
  a purely client-side VM projection: nothing about `pending` crosses the wire.
- **`failed` (optional boolean) — a send that provably never landed.** The same
  VM sets `failed: true` (and strips `pending`) on the ONE optimistic
  `user_message` when the turn settles as a send failure with NO server evidence
  the send reached the engine — a lost send (`SEND_LOST`), a rejected/refused
  send (a 409, the not-connected card), or a concurrent double-send loser. It is
  **mutually exclusive** with `pending` and only ever set instead of the
  clock->check confirmation, so a host renders three delivery states, not two:
  `pending` -> clock, `failed` -> an error/undelivered tick (NEVER "Sent"),
  neither -> a check. A delivered-then-errored turn never sets it — real frames
  confirm the bubble first. Optional and client-side exactly like `pending`.
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

---

## 9. Native-backed ports (fetch + storage over the pipe)

An embedded engine has no HTTP stack and no persistent store of its own. The SDK
reaches both **through the host, over the same pipe**, as request/reply message
pairs correlated by an **SDK-minted** `id` (a separate namespace from the
host-minted command `id`/`sub`; ids appear only inside these `fetch/*` /
`storage/*` frames, so they never collide with `result`/`snapshot` ids).

### 9.1 fetch

Every engine request — a `GET /agents`, a `POST …/messages`, and the long-lived
`GET …/events` SSE — leaves as a `fetch/start`; the host performs the real
network I/O and streams the response back:

```json
→ { "kind": "fetch/start", "id": "f7", "url": "http://127.0.0.1:4317/agents/ag_1/conversations/cv_42/events",
    "method": "GET", "headers": { "accept": "text/event-stream", "authorization": "Bearer eyJ…" } }
← { "kind": "fetch/response", "id": "f7", "status": 200, "ok": true }
← { "kind": "fetch/chunk", "id": "f7", "bytesBase64": "ZGF0YTogeyJ0eXBlIjoic3luYyJ9Cgo=" }
← { "kind": "fetch/chunk", "id": "f7", "bytesBase64": "ZGF0YTogeyJ0eXBlIjoidGV4dCJ9Cgo=" }
← { "kind": "fetch/done", "id": "f7" }
```

- **`fetch/start { id, url, method, headers, body? }`** — `headers` is a flat
  string map. `body` is a UTF-8 string (the SDK sends `JSON.stringify(...)` or
  nothing); absent when there is no body.
- **`fetch/response { id, status, ok }`** — resolves the SDK's `Response`.
  Response headers are **not** carried: no consumer reads them (see the pinned
  contract below).
- **`fetch/chunk { id, bytesBase64 }`** — one body chunk, **base64** (the pipe
  is JSON strings; raw bytes are not JSON-serializable). The SDK decodes to
  `Uint8Array` and feeds its stream reader. Send as many as the body has;
  a non-streaming JSON body is typically one chunk.
- **`fetch/done { id }`** — the body ended cleanly. **`fetch/error { id, message }`**
  — the request/stream failed; before `fetch/response` it rejects the `fetch`
  promise, after it errors the body reader (which the resume loop reads as a
  dropped connection and reconnects, §7).
- **`fetch/abort { id }`** (SDK→host) — the SDK aborted this request (switching
  conversations, teardown). The host cancels the native request; any later
  `fetch/*` for that `id` is ignored.

**The minimal `Response` the SDK assembles** — only these members are used, so
only these are guaranteed (each pinned to its consumer in `@houston/runtime-client`
/ `@houston/sdk`):

| Member | Consumer |
| --- | --- |
| `status` | `client.ts` (EngineError), `auth-fetch.ts` (401), `agents/http.ts` |
| `ok` | `client.ts`, `agents/http.ts` |
| `text()` | `client.ts` (error body), `agents/http.ts` |
| `json()` | `client.ts` (`json<T>`), `agents/http.ts` |
| `body` (truthy) + `body.getReader()` | `client.ts` (`streamEvents`) |
| `getReader().read() → { done, value: Uint8Array }` | `sse-read.ts` |

`releaseLock()` exists as a no-op (spec symmetry) but no consumer calls it;
`Response.headers` is never read.

### 9.2 storage

`SdkPorts.storage` (the token custody store) is a request/reply pair; the host
serves it from Keychain / SecureStore / SharedPreferences:

```json
→ { "kind": "storage/get", "id": "k1", "key": "houston.sdk.session.token" }
← { "kind": "storage/result", "id": "k1", "value": "eyJ…" }     // string, or null if absent
→ { "kind": "storage/set", "id": "k2", "key": "houston.sdk.session.token", "value": "eyJ…" }
← { "kind": "storage/result", "id": "k2" }                       // value omitted for set/delete
→ { "kind": "storage/delete", "id": "k3", "key": "houston.sdk.session.token" }
← { "kind": "storage/result", "id": "k3" }
```

`storage/result` carries `value` (string | null) only for a `get`; it is omitted
for `set`/`delete`. If the host declared `native.storage: false` in `configure`
(§2.1), the bridge serves storage from an in-memory map and emits no `storage/*`.

### 9.3 clock + logger — not port-bridged

- **Clock is NOT bridged.** The SDK's `setTimeout` / `clearTimeout` / `Date.now`
  come from the JS engine's own globals (§10), which the host already backs with
  its native run loop; the resume/backoff loops schedule against those globals
  directly. Bridging the clock would put a message round-trip on every backoff
  tick and idle-watchdog sweep for no benefit, so timers stay in-engine.
- **Logger** forwards each line as `{ kind: "log", level, message, fields? }`
  (SDK→host, no reply). Route it to your native log / Sentry, or drop it.

### 9.4 Command vocabulary (informative)

The bridge routes command `type` strings **opaquely** — they are owned by the
SDK modules, not this contract (§2). The §6 flows use illustrative names; the
**registered** types today are: `session/setToken` (§6.1/§6.6 call it
`session/attach`), `agents/refresh` · `agents/create` · `agents/rename` ·
`agents/delete`, `conversations/refresh` · `conversations/rename` ·
`conversations/delete`, and `turns/send` · `turns/cancel` · `turns/observe`.
New modules add types without touching the bridge.

---

## 10. Host polyfills (normative)

The bundle targets a **bare** embedded engine (JavaScriptCore / Hermes outside a
WebKit web context), so it assumes very little. The split:

**The host MUST provide these globals** (no pure-JS substitute; they need the
native run loop):

- `setTimeout(fn, ms)` / `clearTimeout(id)`
- `setInterval(fn, ms)` / `clearInterval(id)` — the per-conversation resume loop
  arms an idle watchdog with `setInterval`.

**The bundle self-provides these if the engine lacks them** (installed only when
`typeof X === "undefined"`, so a host that already has them wins) — a host need
NOT polyfill them, but MAY:

- `Headers` + `Request` — `auth-fetch.ts` builds `new Headers()` on every
  authenticated request and tests `input instanceof Request`.
- `AbortController` / `AbortSignal` — stream cancellation.
- `TextEncoder` / `TextDecoder` — UTF-8 SSE decoding (`TextDecoder` with
  `{ stream: true }`).

**Optional** (used if present, gracefully degraded if not):

- `crypto.getRandomValues` — nonce entropy; falls back to `Math.random`.
- `console` — the SDK logs through the `log` port, not `console`, so it is only
  a convenience.

The bundle needs **no** `fetch`, `btoa`/`atob`, `Buffer`, `process`, `document`,
or `window`. A CI smoke test evaluates the built IIFE in a bare Node `vm` context
with **only** the required globals injected and round-trips a command, so any
hidden global dependency fails the build.
