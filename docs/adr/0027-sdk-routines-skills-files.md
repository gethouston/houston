# Routines, skills, files, citations and the briefing

These SDK modules work on what lives inside an agent or a workspace: `routines`, `skills`, `files`, `citations` and `heartbeat` under `packages/sdk/src/modules/`. Each runs on its own HTTP seam with literal paths (which keeps the routes visible to the assistant catalog), throws on every non-2xx with its status, and lets the surface decide what a 404 means.

## Routines

### Routes

Routine definitions (`http.ts`) and runs (`runs.ts`) are agent-proxy routes under `/agents/:id`, which the gateway forwards to the agent's pod. The webhook-key mint is the exception: it is a gateway control route under `/v1/agents/…`. Sending it under `/agents/:id` would forward it to the engine pod, which never serves webhook keys, and its 404 would read as "this deployment cannot mint" on a gateway that can. The host announces changes on `RoutinesChanged` and `RoutineRunsChanged`, so no routine write refetches.

`deleteRoutine` treats `404 routine_not_found` as done for SDK callers: the routine was deleted elsewhere or listed from a stale mirror, and the end state holds. The worker that answered re-projects the routines doc, and if that write fails the row can reappear on the next list until a later projection lands. `isRoutineGone` (`routine-gone.ts`) never matches a 404 for anything else, above all `agent not found`. A burst of them still means a stale mirror, so surfaces report it as one fingerprinted warning.

`requireNewRoutine` (`types.ts`) does not check the wake mechanism. `schedule` and `trigger` are mutually exclusive and the host enforces that, so a client guess would refuse bindings a newer gateway accepts.

### Who a routine runs as

- `viewerIsRoutineCreator` (`routine-creator.ts`): a fired routine runs on its creator's credential and is judged on its creator's plan, so the viewer's own provider status or plan describes the routine only when the viewer is the creator. A routine with no creator (an Agent Store install or an import strips `created_by`) counts as the viewer's; the next save stamps whoever saves. While the session loads, no routine counts as the viewer's.
- `webhook-key-access.ts` is the client half of the gateway's mint rule: only the recorded creator may mint or rotate, because a hook fires on the creator's credentials and a rotation retires their live address, and no org role overrides that. A routine with no creator fires on the space's credential, so only the space owner may mint. `not_creator` and `not_owner` are told apart because the surface names who can mint. `unknown` offers nothing until the session and role load. The gateway still enforces the rule with `403 not_creator`.
- `WebhookKeyReveal.secret` is shown once and never stored in routine data. Minting again rotates and the old secret stops working.
- `routinePin` (`fire-pin.ts`) reads the pin through the host's own ladder in `@houston/domain`, the same one the scheduler and trigger path use, so the model a surface shows is the model that runs.

### Pauses, snoozes and failures

The engine records only why a routine stopped. What to tell the person is decided once here, so desktop, web and the AI Manager agree.

- `routinePauseNotice` (`auto-pause.ts`) covers `Routine.auto_paused`, written after the same account or model problem failed the latest runs. A hand pause carries no reason and gets no notice. A reason this client has no fix for shows nothing rather than throwing. A usage limit never pauses; it snoozes. Resuming is `updateRoutine(..., { enabled: true })`.
- `routineSnoozeNotice` (`snooze.ts`) covers `Routine.snoozed`, a hold until a plan usage limit resets. The routine stays enabled and fires again at `until`; switching it to another model ends the hold early. The hold gates only the cron schedulers, so a trigger routine is never shown as held, and a snooze whose instant has passed is inert.
- `failure-view.ts`: the engine records a run with no credential as `*_not_connected`, because a signed-out account looks like one never connected from inside the sandbox. The gateway knows the difference and marks the provider `needs_reconnect` on the reader's status, and then the failure reads as `*_needs_reconnect`. The reader's status speaks only for their own account: the creator's when the reader created the routine, or the space's single account when the reader's probe was answered by it.
- `planMinIntervalRefusal` (`plan-floor-quiet.ts`) judges a `400 plan_min_interval` body with the protocol's own parser, the one the host's refusal is pinned against, so the classifier and the copy that names the floor never disagree.
- `plan-floor-quiet.ts`, `routine-gone.ts` and `webhook-key-access.ts` are loaded by the app's `node:test` runner through `@houston/sdk/routines/*` subpaths, so they stay dependency-free and use erasable syntax.

## Skills

Two families share the name. `sdk.skills.agent` is one agent's own skills (its `.agents/skills/` and the manifest saying which workspace skills are on). `sdk.skills.shared` is the workspace library (`/v1/workspaces/:id/shared-skills`), which takes the server's workspace id; the web UI's synthetic personal id is translated before it reaches the SDK. Command names follow `<family>/<verb>`, so the shared family is `skills.shared/*`.

### Manifest writes are serialized per agent

`SkillsManifest` (ADR 0003): a shared skill is off until its slug is in the manifest, and an agent-local skill always loads and shadows a shared skill with the same slug. Every manifest write reads the whole enabled list and writes it back, so two started together would both read before either wrote and the second would drop the first. `agent-facade.ts` queues them on one chain per agent. The stored chain is the settled one, so a rejection reaches its own caller without stalling the queue.

`requireManifest` refuses an `enabled` that is not a list of strings rather than coercing it, because every omitted slug is a disabled skill.

### Order inside the two override acts

`agent-overrides.ts` makes two acts each a manifest write plus deleting the agent's own copy. A local copy loads whether or not the manifest names it, so both must move, and the copy, the only thing nothing can restore, is deleted last. `revertSkillOverride` switches the entry on first, because deleting the copy before the agent can load the workspace version would take the skill away entirely. `disableSkillForAgent` switches the entry off first because that half is reversible. `dropAgentCopy` treats 404 as the end state both acts want. Neither act is an assistant operation because neither issues a request of its own; the assistant reaches the same end through `setSkillEnabled` and `deleteSkill`, where the delete asks the person first.

### Skills built in chat

`drafts.ts` (published as `@houston/sdk/skill-drafts`) decides what counts as an unfinished creation chat. A skill-setup chat is a real conversation marked with `SKILL_SETUP_AGENT_MODE` (`houston:skill-setup`, namespaced so it cannot collide with a user mode id), and every mission board filters it out, so until the agent writes the SKILL.md the chat has no home but the Skills surface.

- The link is stored both ways: the skill's frontmatter `setup_activity_id` (the agent writes it) and the activity's `skill_slug` (the client stamps it, and it is durable because agents never rewrite `activity.json`). A chat either side points at is claimed and is no longer a draft.
- Decisions wait for settled data. A cached placeholder row has no `skill_slug`, so a finished skill's chat would read as unfinished, and resuming it would land the person in a conversation that vanishes once the real read answers. A failed read has no draft to trust either. `resolveDraftResume` reports an id the settled list no longer holds as `missing`.
- `allowResume`: resuming where no rows are listed would drop the person into an older chat about another skill with nothing on screen explaining why. The most recently worked-on draft wins, and a tie keeps read order. `unfinishedDraftRows` leaves out the chat already open beside the list.
- `discardDraftThenRestart` archives first and starts the replacement only after: a replacement started beside a failed archive leaves two unfinished chats. Discarding is the board's own archive write (`drafts-writes.ts`), so there is no second route.

## Files

The `/agents/:id/files*` family is served by the host, not the runtime client. The two binary reads (a file's bytes, the workspace zip) stay with the surface that renders them, because a `Blob` cannot cross a JSON envelope.

- The host frames anything it cannot serve as text (an image, a PDF) as base64 and says so, and the module decodes it, so a caller always gets the file's real bytes as the latin1 string `atob` answers instead of a garbled transcription (`http.ts`).
- Uploads (`uploads.ts`) are DOM-free. The adapter batches browser `File`s by size to stay under the host's cap and hold one batch in memory, keeps `webkitRelativePath` as `relPath`, and passes named Blobs. The SDK picks base64 or resumable transfer. Each call keeps its literal `httpRequest(…)` so `check:sdk-parity` and the catalog can read its route and body fields. The workspace root is sent as an explicit `null`, and `nullableString` maps an omitted folder to it rather than to a folder named "undefined". `requireUploads` checks every entry before anything is sent, so a malformed entry fails before the host starts writing a batch.
- `UploadInterruptedError` (`upload-interrupted.ts`) is a request that died before any answer. It used to read as offline: the edge proxy cut any body still uploading at 60 s, so a slow attachment failed every retry while the rest of the app worked. The error keeps elapsed time and batch size, which tell a proxy timeout from a dropped connection. It is deliberately not chained to the transport `TypeError` as `cause`, because every offline classifier unwraps one level of `cause`. Its `name` is a string literal because the production bundle mangles class names and surfaces branch on `err.name`. A coding-bug `TypeError` is left as is so it still files as a bug.
- `sinkUrl` (`resumable-upload.ts`) appends a path-shaped sink to the base URL as is, so a base with a path prefix keeps it.

## Citations

`citations` holds comments a person pins to regions of a previewed file and sends with their next message. A draft's comments are client state keyed by the composer's draft key, like its text, and each draft publishes one list that the chips, page marks and thumbnail counts all read.

- `compose` uploads each region's crop into the agent's `uploads/` folder and folds the comments into the message text as a model-facing list plus a hidden marker the sent bubble decodes (`@houston/wire-types` citations). The comments leave the draft while that message is out, so the next send cannot carry them twice, and are held as a claim keyed by the envelope in the text. Whatever send path the text takes, `accept` drops them for good and `release` (refused, removed from the queue, never sent) gives them back.
- `clearAll` drops every draft and claim on an identity change, because the crops belong to the person who made them. A generation counter makes work started before it land nowhere.
- `compose` waits for the sharp crop when one is still rendering (`trackCrop`). `CITATION_LIMIT` is 10, because past that the agent skims and the crops weigh on the upload.

## Morning briefing

`heartbeat` is the AI Manager's daily briefing on the open host's `/v1/heartbeat` family. The host resolves the person's personal workspace from the session, so nothing names an agent. The surface refreshes on `HeartbeatChanged`. `HeartbeatFailure` (`types.ts`) classifies once: `turn_running` (ask again shortly), `failed` (the turn could not start, usually no AI connected, and today's run is spent), `unavailable` (this deployment does not serve it), `unexpected` (a defect). `requireHeartbeatPatch` checks each field so a typo never reaches the host as a silent no-op.
