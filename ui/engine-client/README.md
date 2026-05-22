# @houston-ai/engine-client

TypeScript SDK for the [Houston Engine](../../knowledge-base/engine-protocol.md).
Consumed by the Houston desktop app, Houston Mobile, and third-party
integrations.

## Install

```bash
bun add @houston-ai/engine-client
```

## Usage

```ts
import { HoustonClient, EngineWebSocket } from "@houston-ai/engine-client";

const engine = new HoustonClient({
  baseUrl: "http://127.0.0.1:53871",
  token: "<bearer>",
});

// REST
const workspaces = await engine.listWorkspaces();
const alpha = await engine.createWorkspace({ name: "alpha", provider: "anthropic" });

// WebSocket — automatic reconnect, typed envelope
const ws = new EngineWebSocket(engine);
const unsub = ws.on("event", (env) => {
  console.log(env.kind, env.payload);
});
ws.connect();
```

Desktop-app-specific bootstrap (reads `window.__HOUSTON_ENGINE__` injected
by the Tauri supervisor) lives at `app/src/lib/engine.ts`.

## Type parity

DTOs live in `src/types.ts` and mirror the Rust types in
`engine/houston-engine-protocol/src/lib.rs`. The Rust side is the source
of truth. A future codegen step (`ts-rs` or `specta`) will remove the
manual sync.

## Protocol reference

- [`knowledge-base/engine-protocol.md`](../../knowledge-base/engine-protocol.md) — wire contract.
- [`knowledge-base/engine-server.md`](../../knowledge-base/engine-server.md) — binary/ops.
