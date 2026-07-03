# @houston/runtime-client

Typed, zero-dependency client + wire contract for the Houston engine. This is the
single source of truth for the request/response/event shapes the webapp builds on.

```ts
import { HoustonEngineClient, type WireEvent } from "@houston/runtime-client";

const engine = new HoustonEngineClient({ baseUrl: "http://127.0.0.1:4317" });

// One isolated conversation: subscribe to its events, then send into it.
const id = crypto.randomUUID();
engine.streamEvents(id, {
  onEvent: (ev) => { if (ev.type === "text") console.log(ev.data); },
});
await engine.sendMessage(id, "hi"); // returns 202; events arrive on the stream above
```

- `HoustonEngineClient` — methods: `health`, `version`, `listProviders`,
  `setSettings`, `authStatus`, `startLogin`, `completeLogin`, `logout`,
  `listConversations`, `getHistory`, `cancel`, `sendMessage` (start a turn),
  `streamEvents` (subscribe to one conversation's id-scoped SSE; ONE connection
  attempt, with an optional `after` resume cursor + `onActivity` byte callback).
- `streamEventsResumable(client, id, opts)` — THE resumable subscription
  (`resume.ts`; options + errors in `resume-contract.ts`): keeps a
  conversation's stream alive until `opts.signal` aborts, reconnecting on any
  drop or idle stall (45s watchdog: a `lastActivity` timestamp swept by one
  coarse interval, never a timer re-arm per chunk; the servers heartbeat every
  15s) with `?after=<last seen seq>` so the server replays exactly the missed
  frames — no gap, no duplicate. `opts.after` seeds the FIRST connect's cursor
  (handing a conversation over from another subscription). Exponential backoff
  500ms → 10s cap, full jitter, reset once a frame is delivered. A fatal
  response (401/403/404/410) rejects with `FatalResumeError` instead of
  retrying forever; every frameless attempt reports through
  `onRetry({ consecutiveFailures, error })` so the caller can enforce a
  failure budget (abort the signal). A `sync` carrying `resync: true` means
  the cursor couldn't be served — the caller reads it off the frame itself and
  refetches history. Legacy servers (frames without `seq`) fall back to plain
  cursor-less reconnects with no dedupe guarantee. Never invents terminal
  frames — a dead connection is a transport problem, not the end of the turn.
- Serving side: `ReplayLog` + `parseResumeCursor` + `formatSseFrame`
  (`replay.ts`), the `sync` snapshot reducer (`snapshot.ts`), the
  `StreamChannel` publish core (`stream-channel.ts`), and the
  `serveResumableStream` connect stitch (`stitch.ts`) — the ONE implementation
  behind every server (runtime bus, host turn relay, the e2e fake host).
- Types: `AuthStatus`, `ConversationSummary`, `ConversationHistory`, `ChatMessage`,
  `WireEvent`, `WireFrame`, `EngineClientConfig`, … — import for component props.

Full protocol: [`packages/runtime/docs/engine-api.md`](../engine/docs/engine-api.md).

## Usage

Consumed as TypeScript source, no build step: `main`/`types`/`exports` all
resolve to `src/index.ts`, so Vite (webapp) and Node/tsx (runtime) run it
directly. Type-check it in isolation with
`pnpm --filter @houston/runtime-client typecheck`.
