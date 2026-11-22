# Missions and routines on pooled turns

With every chat turn in an E2B sandbox and pods asleep (ADR 0005), five mission and routine paths that used to lean on a standing pod need their own rules. HOU-231 settles them as follows.

## A pooled turn is an agent caller

An ordinary pooled turn mounts the six mission and agent-directory tools (`start_mission`, `list_missions`, `read_mission`, `update_mission_status`, `list_agents`, `read_agent`). Until now only Houston's own agent had them, for three reasons the old code never wrote down. A worker has no turn channel to fire a mission's first turn. The agent-to-agent path signed with the pod's standing host token, which never reaches a worker. A turn hydrates only its own transcript.

The fix answers each of those:

- Every start goes to the gateway's `POST /agents/{slug}/missions/start`, which dispatches the mission's turn. That includes a start on the agent's own board.
- The turn signs with its `turn-v1` host token plus the acting token minted for the same claim. The gateway accepts that pair only while the claim is live and names the same org, agent and claim. Both tokens die with the claim.
- Transcript reads (`read_mission`) also go to the gateway. The board list and status moves stay on the hydrated board and its sync-back merge.

A start on the agent's own board is not delegation. It writes no delegation ledger row, puts no delegator on the acting token and skips the Teamwork check, the same as a pod's own-board start. The gateway allows an agent onto its own board only for `missions/start` and `missions/read`. Mission depth stays capped at 1. The host checks the card's `origin_session_key`, and the gateway checks origin depth plus delegator.

The missions prompt section has three variants, chosen from what the turn actually mounts. `full` is the desktop and pod text. `nested` adds that this chat cannot start missions. `none` says missions cannot be started here. A turn cannot read the Teamwork setting, so that stays a conditional sentence, and the gateway's `delegation_off` refusal reaches the model as it is.

## The plan gate follows the live mode

In a pooled Houston turn, the host's live-turn record copies `turn.liveMode` on every forwarded call, so no mode writer has to update it. Any later writer of the live mode is covered.

## Orphaned mission cards are settled by the reconcile sweep

A gateway replica that drains during a deploy abandons the follows it holds, and their mission cards stayed `running`. The control plane's reconcile sweep now finds pool sends on `activity-` chats whose claim was released (`expired` after a worker accepted it, or `reconnect_timeout`) with no later claim on the chat. It asks the gateway to settle the card the way `turnCardSettle` would have, from the turnlog terminal, or from the transcript row once the turnlog is trimmed. A send with no reply waits out the 35-minute re-dispatch window and then settles `error`. The board write is a CAS on `running` and on nothing written after the release, so a card a person moved keeps its status.

Re-following live claims at startup was rejected. A rolling deploy boots new replicas before the old one's 5m20s drain ends, so a startup scan finds nothing to follow. And no durable record says which replica follows which send. The claims table already marks every follow that died, whether by drain, crash or OOMKill.

## Mission reads never wake for file transcripts

`missions/read` is off cloud's `podrequired.go`. The gateway reads the file the host's `missions-read.ts` would read: `activity-<id>` first, then the card's `session_key`, live file only. The response is byte-identical to the pod's. Only the store-level grants can still hand the read to a pod: `store_not_migrated`, `doc_layout`, and `file_transcript` for a file that does not parse or is past the read cap.

## Title ops run on the agent's own provider

An Anthropic agent's title op goes through the Claude Agent SDK in the op sandbox, the same seam the in-turn title uses, never through pi. When the gateway cannot title an asleep agent it answers `503` with `code: "title_unavailable"`, and the client's truncated-title fallback covers it.

## Routines pause on an untyped provider failure that persists

The turn terminal frame carries `providerFailure: {kind, provider, status?, code?}`. `code` is the provider's own error-type token, limited to `[A-Za-z0-9_.-]` and 48 characters. The frame never carries message text or model ids. The gateway re-checks each value and logs it on the "pool turn follow settled" line, next to the mission-title outcome and `worker_timings_ms`.

A routine run that ends on an `unknown` provider error is recorded as `provider_error`. Five in a row pause the routine, against ten for the typed walls. In 30 days of prod data (539 untyped failures across 25 routines), no untyped streak of two or more recovered by itself. The pause is written as `reason: "model_unavailable"`, `cause: "provider_error"`, the pattern `no_model` uses, because `routines.json` is served to every client version and clients before PRODUCT-1982 throw on a reason they do not know. Current clients show the `keepsFailing` notice.
