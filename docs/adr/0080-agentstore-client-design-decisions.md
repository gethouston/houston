# Agent Store client: design decisions

Covers `packages/agentstore-client/`: the HTTP client for the gateway's Agent Store API. Short file paths are relative to `packages/agentstore-client/src/`.

## One isomorphic client

`@houston/agentstore-client` is the only HTTP client for the gateway's Agent Store API under `/v1/agentstore`. It reads no environment and touches no `window`, `document` or Node built-in. Consumer concerns (which gateway origin, Next.js `next.revalidate` caching, forwarded XFF headers) come in through constructor options and per-call options.

Lives in `packages/agentstore-client/src/client.ts`, `index.ts`.

## Per-call options merge order

`init` is shallow-merged into the `fetch` call, `headers` is merged on top of the client-computed headers, and `init.headers`, when present, wins over both.

Lives in `client.ts` (`RequestOptions`).

## Missing token fails before the request

When `getToken` is absent or returns `null`, every authenticated method throws a 401-shaped `StoreApiError` without sending anything.

Lives in `client.ts` (`authHeader`).

## Multipart uploads never set Content-Type

Avatar uploads send `FormData` and leave `Content-Type` unset so `fetch` derives the boundary. Setting it by hand breaks the parse on the gateway.

Lives in `client.ts` (`uploadAvatar`, request builder).

## One error class

Every consumer imports `StoreApiError` from one module so `instanceof` holds across bundles; a duplicated class breaks identity. It carries `status` (`0` for a network failure), the gateway's `{error}` machine token as `code`, and the parsed `body` (raw text for non-JSON bodies, which keep the status-based message). On a network failure the thrown error is also the standard `cause`, so the app's offline classifier sees the transport `TypeError` instead of reporting an offline device as a bug.

Lives in `packages/agentstore-client/src/errors.ts`, `client.ts` (`readError`).

## Wire types follow the Go handlers

The types are reconciled against `cloud/internal/edge/agentstoreroutes` and `cloud/internal/agentstore`. Notable rules the gateway enforces:

`state` and `visibility` are always on the wire but optional in the type so browse-only consumers stay decoupled from the owner surface. Owners may only set `unlisted`; `public` comes only from admin approval.

Catalog and creator directory pages are fixed at 24 server side.

`PATCH /agents/{id}` applies intents in a fixed order, but callers send exactly one per call; `ir` is re-validated and scanned for secrets on the server.

`verified` is never settable through `PATCH /me/profile`; the first materializing patch needs `handle` and `displayName`.

The admin handle grant allows reserved handles, which is how official handles are minted, and does not set the verified badge.

Analytics `days` is clamped server side to [1, 90] and defaults to 90.

Creator reports reference the profile by `profileUserId` and current `handle` (null after a release), not by agent id.

Summary fields added later (such as skills) are backfilled when talking to an older gateway.

Lives in `packages/agentstore-client/src/types.ts`, `client.ts` (summary backfill).
