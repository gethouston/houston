# Pool turns announce and save their work as they go

A pool turn runs in a short-lived E2B sandbox. Until this change it announced its changes and saved its workspace files only once, in the durability pass at the end. Other tabs saw a routine's running row, a saved routine or a new file only after the turn ended, and a sandbox that died mid-turn lost every file it had written.

## The `landed` frame

A turn now emits a non-terminal `landed` frame (`{ type: "landed", data: { changed } }`, protocol `WireEvent`) each time a mid-turn write becomes durable and its read model can be served while the agent sleeps. The gateway's follower announces each one to the org's members as it arrives, the same way it announces a terminal frame's `data.changed`.

One per-turn queue (`packages/runtime/src/turn/turn-landed.ts`) produces the frames. Three writers feed it:

- every generation-guarded document write (`mutateTurnDocument`) once the turn is running: a routine fire's running row, `save_routine`, `save_learning`;
- the routine start, which waits for the queue so the running row's doc is projected before the turn runs;
- the workspace checkpoints below.

The rule an event follows is unchanged: an event promises that the refetch can be answered asleep. So the queue projects each written family into its doc first (`publishLandedFamilyDocs`, the skills view) and leaves out any family whose doc did not land. Three families wait for the terminal frame because their read model is written only at the turn's end: `ConversationsChanged` (transcript rows), `ActivityChanged` (the board doc) and `CustomIntegrationsChanged` (the definitions view). The queue is closed before the terminal frame, so no `landed` frame follows it.

Clients ignore the frame. The SDK's frame fold has no case for it, and the Go relay passes unknown types through byte for byte, so older apps and gateways are unaffected.

## Workspace checkpoints

During a claimed turn, `turn-checkpoint.ts` runs the normal sync-back (`syncTurnFilesystem`) narrowed to the agent's workspace, outside `.houston/`. Transcript, session, board and doc files stay with the final pass, because their projections and merges belong to it.

A checkpoint runs at most once a minute, only after a tool ended since the last one, and never starts while a tool is running. A tool that starts during a checkpoint stops its remaining uploads, so at most the one file in flight can be caught half written, and the final pass replaces it. A checkpoint only uploads. It never deletes: a file missing on disk may be mid-rewrite by a tool, so deletes stay with the final pass, and a file the person had before the turn survives a lost sandbox. The interval stretches to five times the last checkpoint's duration, so a large tree is not hashed over and over. No checkpoint runs while the agent's deferred files are still downloading, because a file that lands mid-walk would look like one the turn wrote. A fenced claim stops checkpointing.

A checkpoint syncs against a copy of the manifest and merges the result back entry by entry. An entry that changed meanwhile, such as a document write or an archive segment load, keeps its newer value. A key the checkpoint could not store (too large, or a conflict) is not merged back, so the final pass retries it and reports it in the terminal frame. Sync-back skips hashing a new file outside its scope, so a checkpoint does not hash the agent's internal state. Landed keys join `immediateWrites`, so the final pass still announces them and republishes their views. The final pass waits for a running checkpoint before it starts.

After a lost sandbox, the files from the last checkpoint are kept. Only the steps after it are lost, and the copy shown to the person says so.

## A turn settled without its terminal frame

When the follower settles a turn from its transcript row because the terminal frame never arrived, the worker's change list is gone. The final sync-back runs before the transcript row is published, so it may have landed any family. The follower therefore announces every family a turn can write, plus the run row for a routine fire, plus anything its `landed` frames named. This path is rare, and an extra refetch costs less than a tab that stays stale.

## Deferred files are gated per path

A pool turn's own files download behind the prompt. A tool now waits only for the deferred files it names (`turn-deferred-tools.ts`, `turn-deferred-gate.ts`):

- A file tool waits for its path, and that object moves to the front of the download queue, out of band or as soon as an in-flight batch leaves it.
- A search waits for what is still pending under its folder.
- A path in the agent's folders that the deferred listing has not reached waits for the listing, never for the download.
- Shell and code-run tools wait for the whole set, for at most 120 s. Their writes cannot be tied to paths: a write that lands before the downloader's copy would be overwritten, and a failed download would drop it at sync. A search over a whole folder has the same 120 s cap.
- A tool that names no deferred path never waits.

Over the budget or after a failed download, only tools that name files that did not load are refused. The refusal names the files and tells the model to continue without them; nothing suggests sending the message again. Shell tools are refused outright only when the listing itself failed. Otherwise the first shell call after a failure is refused once with a notice that commands see only the files that loaded and that changes to the missing ones are not saved; the next call runs.

The file-change "before" snapshot is the prompt-start walk plus each deferred file's state, recorded when it lands and before any tool is released for it. After a failed or abandoned download, sync leaves out only the deferred objects the turn never owned: listed but never settled, or landed outside the manifest.

A new tool that writes the agent's files without naming a path must be added to the whole-tree set in `turn-deferred-tools.ts`.
