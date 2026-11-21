# app/src/lib/agent-provisioning: design decisions

Covers `app/src/lib/agent-provisioning/`: agent creation while its engine warms. File paths in this record are relative to `app/src/`.

## Creating an agent answers before its engine is warm

On the hosted profile the create returns at once while the engine warms. Per-agent reads for a just-created agent may answer "nothing yet" instantly because it has no data by definition. An existing agent found asleep must instead ride the gateway hold so its cached lists stay painted.

Lives in `lib/agent-provisioning/entry.ts`, `lib/agent-warming-guard.ts`.

## Sends during warm-up are queued, not fired

A held request dies with load-balancer timeouts, so sends queue with everything needed to flush later (board row, landing status, mentions, title source). On handoff, queued messages go out first so their turns register before the refetch, and the refetch of the board keys happens before optimistic rows drop, so there is no one-frame gap.

Lives in `lib/agent-provisioning/entry.ts`, `lib/agent-provisioning/handoff.ts`.

## The probe is a long poll with one deadline

The platform holds any per-agent request until the engine is reachable, so the readiness probe is a small side-effect-free config read with one deadline anchored to the create call. A gateway 502, 503 or 504 means keep waiting; the single 404 path means the agent is gone, which drops the entry and heals the roster. A TTL past the answer flags the entry as stalled and keeps waiting rather than clearing it.

Lives in `lib/agent-provisioning/probe.ts`, `lib/agent-provisioning/warmup.ts`.

## Born config seeds the cache

A new agent's config cache is seeded, stale, from what the create recorded, with the provider in pi's canonical dialect, so start buttons render before the first real read.

Lives in `lib/agent-provisioning/born-config.ts`.

## Persisted entries survive a relaunch

A timed-out entry is kept regardless of age because it is still visibly parked and re-arms its probe.

Lives in `lib/agent-provisioning/persist.ts`.

## Asleep detection threshold

An awake engine answers the probe read well under a second, so a longer wait means a pod scaled to zero.

Lives in `lib/agent-provisioning/asleep.ts`.

## Warm-up copy threshold

The screen stops promising "a few seconds" after the production p90 from create to first engine answer.

Lives in `lib/agent-provisioning/warmup.ts`.
