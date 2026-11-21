# Runtime client: design decisions

Covers `packages/runtime-client/`: the typed engine client, the turn snapshot reducer, store hydration and sync-back, and the Sentry reporter. Short file paths are relative to `packages/runtime-client/`.

## Typed engine client with no dependencies

`HoustonEngineClient` uses only `fetch` and SSE, and is split into mixins (auth, conversations, integrations, preferences, browser) over one `Requester` that joins base URLs, adds the bearer and throws `EngineError` on non-2xx. Wire shapes live in `@houston/protocol`; this package re-exports and adds the client-only parts. Its sources are hashed into the assistant catalog, so `pnpm gen:assistant-catalog` must run after any edit.

Lives in `packages/runtime-client/src/client.ts`, `client-*.ts`, `requester.ts`, `types.ts`.

## Provider ids are escaped in auth paths

Every `/auth/:provider/...` path escapes the provider id instead of splicing it. `ProviderId` accepts any pi-ai id, so escaping stops a `/` or `?` from changing the path, and an escaped interpolation is something the catalog generator can derive (it refuses unescaped ones).

Lives in `src/client-auth.ts`.

## Browser hand-off stream sends no Accept header

The host proxy keys SSE on the response content type, and an extra header leaves the route underivable for the assistant catalog and so unbound for the parity gate.

Lives in `src/client-browser.ts`.

## One sequencing authority per conversation

`ReplayLog` stamps every frame `watermark + 1` and ignores any incoming `seq`, because re-stamping a duplicate or stale seq as new content is the hazard a single authority prevents. It buffers the in-flight turn in a fixed-size ring (overflow drops the oldest), finds the replay suffix by binary search, and clears after the terminal frame is fanned out; the counter never resets. The resume cursor is `Last-Event-ID`, falling back to `?after=`.

Lives in `src/replay.ts`, `src/ring-buffer.ts`, `src/stream-channel.ts`.

## Server-side resume stitch

A connection replays or syncs per its cursor, then flushes frames buffered during the async reads, deduped against what replay covered; after that live frames flow in arrival order with no seq gate. This is the one implementation behind every conversation events route.

Lives in `src/stitch.ts`.

## Client-side resumable subscription

One implementation of the resume contract served by the runtime and host events routes. Every drop reconnects with `?after=<last seq>` so the server replays exactly the missed frames. It never invents terminal frames: a dead connection is a transport problem, and the caller settles only on a real terminal frame. 401, 403, 404 and 410 stop the loop because retrying cannot fix them. Backoff uses full jitter (first cap 500 ms, ceiling 10 s). A delivered frame resets the failure count; a frame without seq means a legacy server with no dedupe guarantee. Exceptions from the caller's `onEvent` are rethrown, never retried.

Lives in `src/resume.ts`, `src/resume-contract.ts`.

## Snapshot reducer

The in-flight snapshot is a pure fold over wire frames shared by every fan-out. A new turn resets text, thinking and tools. Tools run one at a time, so a tool end closes the last running tool. `provider_error` is terminal because pi ends the run without a clean `done`; otherwise a late subscriber's `sync` would show the turn running forever. Boundary markers (provider switch, compaction, `/clear`) are not turn progress.

Lives in `src/snapshot.ts`.

## Global events loop uses fetch, not EventSource

The workspace-global `/v1/events` subscription is one loop shared by the SDK and the web control-plane adapter, each with its own auth and translation. It uses `fetch` plus `readEventStream` because a cross-origin `EventSource` never connects inside the Tauri webview. Malformed frames are dropped. After a stream that carried real bytes drops, it reconnects fast instead of inheriting the previous outage's backoff (first cap 1.5 s, ceiling 10 s, full jitter). `onOpen` fires after each connect so consumers can refetch.

Lives in `src/global-events.ts`, `src/global-events-contract.ts`.

## Idle watchdog and wake signals

Both long-lived loops force-close a connection silent past the idle timeout (default 45 s; servers heartbeat more often). Silence counts only while the page runs: a sweep far past the previous one (twice the sweep interval) was held by a sleeping page, not a busy moment, so it does not count. A wake (window visible, network back, OS resume) waits before judging, because heartbeats received while asleep may not have been read yet; judging at once would tear down every healthy stream on return to a backgrounded window.

Lives in `src/idle-watchdog.ts`, `src/global-events-contract.ts`.

## WebKit duplicate stream error

WebKit surfaces a fetch body's transport error twice: the pending `read()` rejects and `reader.closed` rejects without the handled flag, so Safari and WKWebView fire a stackless "Load failed" unhandled rejection. The duplicate is defused; the real error still reaches the caller through `read()`. A tolerant mode reports unparseable `data:` lines instead of throwing.

Lives in `src/sse-read.ts`.

## Trailing slash trim without regex

`/\/+$/` backtracks quadratically on a long run of slashes, so a loop trims them.

Lives in `src/trim-slashes.ts`.

## Engine Sentry client

The engine reports through a light client with a plain `fetch` transport, because `@sentry/node`'s OpenTelemetry require hooks do not survive `bun build --compile`. Activation is derived from the environment only (`HOUSTON_MANAGED_CLOUD=1`, `HOUSTON_SIDECAR_BINARY`, `NODE_ENV=production`, else a source run that stays dormant unless `SENTRY_SEND_IN_DEV` is truthy). Rules:

`token=<value>` credentials are redacted from captured log lines, because the desktop host's listening banner carries the per-boot bearer. General breadcrumb scrubbing is out of scope; credentials are not.

Node's `(node:<pid>) [CODE] Warning:` lines arrive through `console.error` but are breadcrumbs, never error events.

Provider error lines are fingerprinted by (provider, kind, cause, sdk slug) and tagged, so each failure family is its own countable issue; grouping by message or by (provider, kind) once merged unrelated families under one misleading title.

`runtime: engine` is kept from the Rust era because existing queries key on it; `engine_process` separates the supervisor host from the runtimes it spawns.

"Users affected" counts only events with a `user`, so the injected identity wins and a managed pod without one reports its org as the user.

Frames are mapped from bundle offsets to `.ts` first, then plumbing frames trimmed, then source context inlined (5 lines each side, clipped lines, a per-event file cap, on-disk sources only).

A re-entrancy guard stops capture from recursing through the console hooks it runs inside; the reporter never takes the engine down. Breadcrumbs are added after capture so an event does not carry itself.

Lives in `src/sentry/client.ts`, `activation.ts`, `frames.ts`, `map-frames.ts`, `console-capture.ts`.

## On-demand source maps

The `.map` beside each engine bundle is not decoded up front; lookups scan the `mappings` string per batch with Node's `findOrigin` rule and no per-segment allocation, and positions are cached because log sites repeat. A missing or unreadable map returns nothing. In tests, macOS symlinks `/var` to `/private/var`, so the fixture uses realpath because esbuild writes sources relative to the real outdir.

Lives in `src/sentry/source-map.ts`, `mappings-scan.ts`, `source-map.fixture.ts`.

## Hydration manifest is the ownership boundary

Durable engine state is hydrated into a local cache and synced back by content hash. Only objects observed on hydrate may later be read as locally deleted. Authentication material and temporary files never cross the boundary. Downloads run 16 at a time by default because one store round trip (about 80 ms through the pod store) dominates cold wake time (a 133-object workspace measured 10.5 s sequential against 0.4 s). Priority inputs land first, the rest after, and deferred objects only after `done` with their own byte budget, timeout and concurrency, so they never compete with what the caller waits on. An over-cap critical set is refused from listed sizes before downloading. A NaN concurrency override would size the worker array to zero and is guarded. Small objects can be read through a batched `POST /batch` whose body is length-prefixed frames in request order.

Lives in `src/object-sync/hydrate*.ts`, `http-store-batch.ts`.

## Hydration excludes

The `.tmp` exclusion matches only `ATOMIC_TMP_SUFFIX`, the suffix every Houston atomic write uses, so a user's own `notes.tmp` is not dropped; a legacy `auth.json.tmp` beside an excluded file stays private too. pnpm's content-addressed store at the synced root is excluded (one agent carried 1.2 GiB, enough to break a 2 GiB hydration cap), root only, matching the gateway's turn prefetch skip in `cloud/internal/pooldispatch/prefetch_package_store.go`. Credential paths are excluded unconditionally because their depth differs by deployment.

Lives in `src/object-sync/hydrate-excludes.ts`.

## Turn prefetch

The dispatcher can inline a listing and object bytes in the turn. The listing answers only the first manifest call, each inlined object is served once, and everything is forgotten at the first write, because inlined bytes were read before the turn held its claim. Malformed prefetch data is dropped rather than failing the turn.

Lives in `src/object-sync/prefetched-store.ts`.

## Retries only without a deterministic answer

Managed pods reach the store through the gateway, so transient blips must not fail a boot hydrate or sync-back. Retries are bounded and cover fetch rejections, 502, 503, 504, and gateway 500s whose body wraps a transient upstream status (`googleapi: got HTTP response code 503`). Everything else is the real answer. GETs and fenced unconditional writes are retry-safe; writes with generation preconditions are not, because a lost success cannot be told from a failure. Streaming uploads use a per-attempt body factory, and large files reopen a disk stream per attempt.

Lives in `src/object-sync/retry.ts`, `http-store.ts`, `http-store-delete.ts`, `http-store-upload.ts`.

## Generations

The gateway's explicit generation capability from the boot lease response wins over inference. Generation 0 means the backend has none (GCS never mints 0); treating it as real flips sync-back into conditional mode against a store that answers 501 to every guarded write. Wire `gen` values are normalized for int64 safety. A point read without a generation in a store whose listing has them lands but is not owned.

Lives in `src/object-sync/object-manifest.ts`, `hydrate-candidates.ts`, `sync-back.ts`.

## Write lease and fencing

A boot writes under a lease (boot id plus fencing token) or a turn claim, never both. Tokens only grow, and a pod-store replica may publish a lease cache up to two seconds old, so the client never adopts a token lower than one it holds; otherwise a stale read would restore the predecessor's token and the boot would fence itself. The lease probe asks `GET <agent>/lease` with a deadline so a slow store cannot stall writes, reads the body to keep the socket reusable, treats a 409 without a live holder as stale, and tolerates old pod-stores that only have POST at that path.

Lives in `src/object-sync/fencing-token.ts`, `write-lease-probe.ts`, `http-store-options.ts`.

## Sync-back passes

Agents keep writing during a pass, so a file may vanish between walk, hash and upload; a vanished file is left out of the next manifest and the delete pass reconciles, instead of aborting mid-pass. Files outside the write scope are never uploaded but stay counted. When any upload is skipped or conflicted, one-shot callers skip the delete pass, because a rename uploads the new key and deletes the old one and a refused upload would leave no durable copy; the standing daemon retries next tick. Files over the store's per-object cap (413) stay local-only. Shared mirrors push local edits before pulling and never upload local deletions.

Lives in `src/object-sync/sync-back*.ts`, `shared-mirror.ts`.

## Document merges on generation conflict

Merged documents (board, routines, run history, learnings, custom integrations) re-merge over bounded rounds with jittered backoff (50 to 800 ms, scaled 0.5 to 1.5) so turns finishing together do not collide in lockstep. Run history gets more rounds (ten overlapping runs need nine) since no person waits on a routine turn. The standing store sync never merges the board, which a standing pod re-uploads over the refreshed generation. Merges replace the local file atomically under the document's own writer lock, and leave bytes the daemon's agent rewrote meanwhile for the next pass. Rules:

Board cards merge by `id`, field by field; the remote wins a field both changed. Without a base, the newer `updated_at` wins and ties go to the remote, because gateway writes are a person's edits. A card deleted on one side is never resurrected.

Keyed docs (routines and memories by `id`, integration definitions by `slug`) take the newer side's whole entry, never a mix, because fields hang together. Deletions stick.

Run history is a two-way union by run `id`; a run only moves forward, `resumed` only turns on, rows sort newest `started_at` first and the per-routine cap is reapplied so a removed row never returns.

An unparseable base only costs three-way precision; an unparseable side lets local bytes overwrite, and the merge reports it. The merge base is trusted only when its hash matches.

Lives in `src/object-sync/sync-back-doc-merge.ts`, `sync-back-merge-retry.ts`, `activity-merge.ts`, `keyed-merge.ts`, `routine-runs-merge.ts`, `sync-back-merge-write.ts`, `sync-back-merge-base.ts`.

## Browser sign-in state is owner-only

A pooled worker runs with umask 002 so the tool user (same group) can edit the hydrated tree, which would leave files group read-write. The browser tool's cookies under `.houston/browser/` are therefore landed owner-only, and their directory must be a real directory this process owns; anything else is refused and logged, and refused state is neither uploaded nor deleted. On POSIX the check and chmod go through one no-follow descriptor. The file is opened without following a final symlink (ELOOP on Linux and macOS, EMLINK on FreeBSD), FIFOs cannot hang the open, it is judged by owner and link count through the descriptor, and only a Playwright storage state JSON is accepted. Windows has no uid and uses an lstat before open.

Lives in `src/object-sync/private-paths.ts`, `private-file.ts`, `sync-back-source.ts`, `land-file.ts`.

## Resource limits in object operations

Files above a small threshold are hashed through a 64 KB stream: hydration hashes 16 objects at once and sync-back rehashes the tree every pass, so a 16 MB threshold allowed 256 MB of transient buffers. Each store operation gets its own AbortSignal following the parent, because fetch keeps an abort listener until the Request is collected and thousands of reads on one boot signal trigger `MaxListenersExceededWarning`. Read deadlines add time per listed byte at about 1 MB/s.

Lives in `src/object-sync/file-hash.ts`, `operation-signal.ts`, `read-timeout.ts`.

## Local directory store

A directory stands in for the object store to keep the sync contract testable. It has no generations and ignores conditional options, and treats a file deleted between listing and read like the HTTP store's 404.

Lives in `src/object-sync/local-dir-store.ts`.
