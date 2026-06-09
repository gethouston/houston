# @houston/runtime-client

Typed, zero-dependency client + wire contract for the Houston runtime. This is the
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
  `streamEvents` (subscribe to one conversation's id-scoped SSE).
- Types: `AuthStatus`, `ConversationSummary`, `ConversationHistory`, `ChatMessage`,
  `WireEvent`, `EngineClientConfig`, … — import for component props.

Full protocol: [`packages/runtime/docs/runtime-api.md`](../runtime/docs/runtime-api.md).

## Build

```bash
pnpm --filter @houston/runtime-client build   # emits dist/ + .d.ts
```

Types resolve from `src`; runtime entry is `dist/index.js`.
