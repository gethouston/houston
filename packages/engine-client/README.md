# @houston/engine-client

Typed, zero-dependency client + wire contract for the Houston engine. This is the
single source of truth for the request/response/event shapes the webapp builds on.

```ts
import { HoustonEngineClient, type WireEvent } from "@houston/engine-client";

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
  `streamEvents` (subscribe to one conversation's id-scoped SSE).
- Types: `AuthStatus`, `ConversationSummary`, `ConversationHistory`, `ChatMessage`,
  `WireEvent`, `EngineClientConfig`, … — import for component props.

Full protocol: [`packages/engine/docs/engine-api.md`](../engine/docs/engine-api.md).

## Build

```bash
pnpm --filter @houston/engine-client build   # emits dist/ + .d.ts
```

Types resolve from `src`; runtime entry is `dist/index.js`.
