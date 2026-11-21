# app/src/lib/product-analytics: design decisions

Covers `app/src/lib/product-analytics/`: the product analytics catalogue, sink and transport. File paths in this record are relative to `app/src/`.

## The catalogue is the front door

Every beat the client may send, its meaning and its allowed properties live in one table; the rest of the app reads through `catalogue.ts`. Gateway-only names are listed so the boundary is readable from this side. Values are coerced to what the route accepts.

Lives in `lib/product-analytics/catalogue.ts`, `lib/product-analytics/catalogue-table.ts`.

## Backlog drops the newest events

A held backlog holds the launch beats the funnel is read from, so the cap discards the newest.

Lives in `lib/product-analytics/backlog.ts`.

## Signed out is a lifecycle state

A batch waits for a bearer without spending attempts. Offline and timeouts get one retry; a batch that died twice on the wire is dropped without a report. Gateway refusals by name or shape are dropped and reported, because resending changes nothing. A host without the route is not retried.

Lives in `lib/product-analytics/queue.ts`, `lib/product-analytics/post.ts`.

## Requests have a timeout

A request that never answers would own the pipe for the whole launch.

Lives in `lib/product-analytics/post.ts`.

## The goodbye flush uses keepalive

Only the final flush on `onAppHidden` pays for a request that outlives the page.

Lives in `lib/product-analytics/sink.ts`, `lib/product-analytics/post.ts`, `lib/product-analytics/wire.ts`.

## Engine globals may not exist yet

The sink listens from above `<EngineGate>`, so a batch can be minted before the engine globals are installed and waits.

Lives in `lib/product-analytics/post.ts`.

## Install id read waits for the engine

The store read mints a fresh id, so reading before the engine is ready would mint a wrong one. The visitor id is read synchronously per batch; desktop never reads it.

Lives in `lib/product-analytics/context.ts`, `lib/product-analytics/transport.ts`.

## Only managed cloud clients send

A local desktop build has no product-analytics gateway.

Lives in `lib/product-analytics/sink.ts`.

## Deployment-level failures report once

They are facts about the deployment, not about one batch.

Lives in `lib/product-analytics/post.ts`.
