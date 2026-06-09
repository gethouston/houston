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

## Usage

Consumed as TypeScript source, no build step: `main`/`types`/`exports` all
resolve to `src/index.ts`, so Vite (webapp) and Bun (engine) bundle/run it
directly. Type-check it in isolation with
`pnpm --filter @houston/engine-client typecheck`.
