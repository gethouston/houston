# app/src/data: design decisions

Covers `app/src/data/`: the client-side writers and helpers for agent data documents (activity, learnings, config). File paths in this record are relative to `app/src/`.

## Activity writes are serialized per agent

Every write reads, edits and rewrites the whole `activity.json`, and optimistic UI lets two writes to one agent be in flight together, so writes queue per agent file.

Lives in `data/activity-writes.ts`.

## Activity patch rules mirror the host

The local patch rule mirrors the host's `applyActivityUpdate` (`packages/domain/src/activities.ts`) field for field. `null` deletes a key the schema has no null type for (model pin, pending interaction). Delete is idempotent. Bulk patches are one read-modify-write so one file write produces one event.

Lives in `data/activity.ts`, `data/activity-bulk.ts`.

## Pure helpers avoid value imports

The app's node:test runner loads value imports for real and the package index's extensionless imports do not resolve there, so pure helpers use subpath imports and type-only imports.

Lives in `data/activity-bulk.ts`, `data/agent-json.ts`.

## Learnings removal of a missing item succeeds

A remove queued behind another remove of the same learning finds it gone, which is the desired end state.

Lives in `data/learnings.ts`.

## Config provider ids are canonical

Config stores pi's canonical provider id. A legacy `"max"` effort is tolerated on read and normalized.

Lives in `data/config.ts`.
