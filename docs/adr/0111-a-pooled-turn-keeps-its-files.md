# A pooled turn keeps its files

A pooled turn hydrates the agent's files into a sandbox, works on them, and syncs them back when it ends. The sandbox is thrown away, so the sync is the only path a turn's work has into the agent. These rules decide what that sync keeps, what it refuses, and how a file it could not save reaches the person.

## Concurrent edits keep both versions

Two turns on one agent often overlap: in three days of production, 151 turn pairs overlapped across 25 agents. A turn's upload carries the generation it hydrated, so a file another writer changed in between fails with a generation conflict.

- Merged documents keep their merge rounds: the board, routines, learnings, routine runs and custom integrations.
- Any other file in the agent's workspace (outside `.houston/`) is never written over the newer remote. If the remote already holds the turn's bytes, the turn adopts them. If the remote is gone, the turn creates it, create-only. Otherwise the remote stays and the turn's bytes land beside it, create-only, as `name (conflict YYYY-MM-DD).ext`.
- Agent state under `.houston/`, runtime files and pool ops keep the single refreshed retry. A conflict copy of a routine's watermark would make the routine repeat its posts, and an op is the person's own explicit action.
- A delete never retries at a newer generation. The changed remote stays and leaves the manifest, so no caller, the standing daemon included, retries the same delete every tick.
- The standing store sync keeps its single refreshed retry for uploads. A standing pod's local tree is the live copy its host and agent keep reading. A copy beside the remote would leave the pod and the store disagreeing on that file until a pull under the host's write lock exists, and ADR 0005 makes standing pods the rare case.

## What a turn could not save is reported

These files did not land as usual: a conflict copy, a lost conflict, a kept delete, a file over the store's object cap, and a write the store refused (outside the claim scope, a link it would not keep, a store that predates a rule). The turn's terminal frame and its reply row carry them as `unsavedFiles`: workspace-relative paths, at most 20 entries, with a total and per-reason counts.

- A per-file refusal skips that one file. It never aborts the rest of the pass.
- A turn keeps one conflict copy per file. The copy is recorded on the turn's tree as soon as it lands, so a later conflict on the same file, at a mid-turn checkpoint (ADR 0113) or the final pass, rewrites that copy at its own generation instead of taking the next name, and a checkpoint that fails after the copy landed loses nothing. The turn takes the next free name only when another writer changed the copy itself. The final pass reports each file's newest copy, including copies only a checkpoint made.
- A report names each path once per reason.
- A deferred link settles, so a tool waiting on its path stops waiting. A link still lands only after every file in its batch has downloaded, even when a tool asked for it first: a link landed early could have a file below it written through it.
- The gateway logs the report on the settled line, warns with the entries, and counts `houston_pool_turn_unsaved_files_total{kind,reason}`.
- The gateway has no Sentry client, so the client sends the Sentry report: the SDK reports `turn_files_not_saved` once per turn, with the counts and total only, never file names. A report that names only `.houston/` or internal paths shows nothing in the chat and is not reported from the client. The gateway's log line and counter carry it.
- Only a per-file refusal from the store (the key or its doc family is outside the claim scope, or the store would not keep a link) skips one file. A refusal of the claim itself still fails the sync, as before.
- The chat shows one line per file under the reply, live and after a reload. The person's own files appear by name. `.houston/` and internal paths never do.

## Links and the executable bit survive

A turn's `node_modules`, `.venv` and `chmod +x` scripts need their links and modes. Object metadata carries both (`houston-link-target`, `houston-executable`).

- Manifests list link objects in their own `links` array, never in `objects`, so a reader that predates attributes never sees a link as a file. The array's presence is the capability signal. A link PUT must be echoed by the server, or the writer deletes it and reports the path.
- A link is kept only when its target resolves below its own agent folder and outside that folder's `.houston/`, with `..` steps only at the start of the target, and hydration never lands anything under another link. The runtime and pod-store apply the same rule.
- The one absolute target kept is the sandbox's own Python interpreter (`/usr/bin/python3` and its versioned names, or the same under `/usr/local/bin`). A virtualenv's `bin/python` points at it. Every other absolute target is refused: a link that leaves the agent folder would let later readers of the agent's files reach files that are not the agent's.

## The claim scope admits what the agent makes

The runtime's `agentScopeIncludes` and pod-store's `claimAllowsTurnAgentKey` admit:

- ordinary workspace files,
- the two turn-owned docs,
- custom integration definitions,
- everything the agent makes under `.houston/`, except the directories and loose files Houston owns. The owned loose files are the flat legacy family files, which the boot migration and the pooled layout check read, plus `agent.json`, `integrations.json` and `skills-manifest.json`.

One vectors file, kept byte-identical in both repos, pins both rules and both lists of owned names.

On a claimed turn, the file guard and `run_code` refuse any write the sync would drop, with a message the model can act on: settings are changed in the app. Desktop and standing runtimes keep their whole tree and have no such rule.

## Shared skills stay read-only on pooled turns

The gateway alone decides who may edit an org's shared skills (owners and admins), and a turn token carries no role. The refusal therefore points the agent at the Skills page instead of opening the shared PUT to turns. A standing pod still pushes mirror edits with its host token, with no per-person role check. That predates this decision and stays open.
