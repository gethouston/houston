# @houston/engine-client

Typed, zero-dependency client + wire contract for the Houston engine. This is the
single source of truth for the request/response/event shapes the webapp builds on.

```ts
import { HoustonEngineClient, type WireEvent } from "@houston/engine-client";

const engine = new HoustonEngineClient({ baseUrl: "http://127.0.0.1:4317" });

for await (const ev of engine.streamMessage("main", "hi")) {
  if (ev.type === "text") console.log(ev.data);
}
```

- `HoustonEngineClient` — methods: `health`, `version`, `authStatus`,
  `startAnthropicLogin`, `completeAnthropicLogin`, `logout`, `listConversations`,
  `getHistory`, `cancel`, `streamMessage` (async generator), `sendMessage`
  (callback wrapper).
- Types: `AuthStatus`, `ConversationSummary`, `ConversationHistory`, `ChatMessage`,
  `WireEvent`, `EngineClientConfig`, … — import for component props.

Full protocol: [`packages/engine/docs/engine-api.md`](../engine/docs/engine-api.md).

## Usage

Consumed as TypeScript source, no build step: `main`/`types`/`exports` all
resolve to `src/index.ts`, so Vite (webapp) and Bun (engine) bundle/run it
directly. Type-check it in isolation with
`pnpm --filter @houston/engine-client typecheck`.
