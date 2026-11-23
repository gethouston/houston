# No archive segment before the prompt

A claimed turn hydrates no archive segment before its prompt (`conversations/<id>.archive/<n>.json`, see `packages/runtime/src/store/conversation-archive.ts`). Its own conversation's segments are skipped like every other conversation's. `ownConversationOnly` in `packages/runtime/src/turn/turn-hot-set.ts` admits only the live file under `conversations/`.

Until now the hot set took the two newest segments of the turn's own chat. Only a shared routine chat has many segments, at about 6 MB each, and the routine digest is the only pre-prompt reader that ever reached into them. In production the gateway could not inline a segment over its per-object limit, so the worker fetched it cold before the prompt. That cost 1.3 to 3 s per run on the slowest agents, and the cost grew with the live file until the newest segment no longer fit.

The digest reads `ROUTINE_REPLAY_TAIL` (200) messages. After a rotation the live file keeps about `ARCHIVE_TAIL_BYTES` (2 MiB). Each run adds at least one message, and the slowest shared routine chats in production grew 1.3 to 4.7 KB per run, so 2 MiB holds about 440 runs or more: the window stays inside the live file. A window only reaches a segment when the chat's messages average over about 10 KB. In that case `loadRoutineReplayArchive` fetches the segments that window reaches, and only those (`turn-archive-fetch.ts`, `segmentsInWindow`). Sends and missions read only the live file before the prompt. `houston_recall` fetches the whole archive on demand, as before.

Segments stay in the claim's write scope (`claimedTurnIncludes`), so a worker-side rotation uploads its new segment. The rotation numbers that segment from the live file's `archived` index, not from the disk. A segment that never landed is not in the hydration manifest, so the sync never reads it as deleted.

## Considered Options

- **Keep the two newest segments.** Every routine run downloads up to two segments it almost never reads, and the cold fetch returns whenever one outgrows the gateway's inline limit. Rejected.
- **Keep the newest segment only.** Same failure at half the size. Rejected.
- **Raise the gateway's inline limit.** The dispatch grows with the archive, and the worker still parses bytes it does not read. Rejected.

## Consequences

- A routine whose last 200 messages span the live file and a segment fetches that segment before its prompt. That is one segment, rarely two, and only for chats whose messages average over about 10 KB. Without the gateway's inlining, that fetch is cold.
- The cloud gateway stops inlining archive segments into a turn's prefetch in the same change (`internal/pooldispatch/prefetch_archive.go`). That gateway change ships only after this worker is in the production template: an older worker still asks for the two newest segments and would fetch both cold.
