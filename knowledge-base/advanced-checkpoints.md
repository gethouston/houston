# Advanced: Checkpoints

Surfaced by the `advanced.checkpoints` flag (Phase 5 of RFC #248).

## What it does

A new **Checkpoints** tab on every agent (when flag is on). Top row to name + create a snapshot of the agent's `.houston/` directory. Below: list of existing checkpoints (newest first) with Restore + Delete actions, both behind a destructive Confirm dialog.

## Storage layout

```
$HOUSTON_HOME/checkpoints/<agent_slug>/<checkpoint_id>/
  manifest.json     — { id, name, createdAt, sizeBytes }
  snapshot.zip      — Deflate-compressed zip of the agent folder
```

`<agent_slug>` is the first 16 hex chars of SHA-256 over the agent's canonical path. Deterministic, filesystem-safe, no collisions in practice.

## Engine

| Function | What |
|---|---|
| `create(home, { agentPath, name })` | walks `agentPath`, zips into `snapshot.zip`, writes manifest. Skips the `checkpoints/` subfolder if it ever overlaps. |
| `list(home, { agentPath })` | reads each `<id>/manifest.json`, sorts newest first. Skips malformed manifests with a warning. |
| `restore(home, { agentPath, checkpointId })` | unzips snapshot back over the agent folder. Overwrites. |
| `delete(home, { agentPath, checkpointId })` | `rm -rf` the checkpoint directory. |

Routes (always on):
- `POST /v1/checkpoints` — create
- `POST /v1/checkpoints/list`
- `POST /v1/checkpoints/restore`
- `POST /v1/checkpoints/delete`

## Frontend

| File | Purpose |
|---|---|
| `app/src/hooks/use-checkpoints.ts` | TanStack Query: list + create/restore/delete mutations. Restore invalidates ALL queries (safe brute-force since restore can change anything). |
| `app/src/components/checkpoints/checkpoints-panel.tsx` | the panel — list, create input, destructive action buttons |
| `app/src/components/checkpoints/confirm-dialog.tsx` | shared destructive-action modal |
| `app/src/components/tabs/checkpoints-tab.tsx` | built-in tab adapter |
| `app/src/agents/tab-resolver.ts` | register `checkpoints` |
| `app/src/components/shell/workspace-shell.tsx` | inject Checkpoints tab on every agent when flag on |

## Why it's gated

Snapshots can take meaningful disk space on long-history agents. Restore is destructive (overwrites the working state). Both are intermediate-skill features power users opt into.

## Limits + safety

- Single zip blob per checkpoint (no incremental dedup yet; v2 candidate)
- No automatic retention — every snapshot stays until explicitly deleted
- Restore is overwrite-style: files added since the snapshot are LOST. The Confirm dialog calls this out per locale.
- The `checkpoints/` directory inside the agent folder (if it ever overlaps with `$HOUSTON_HOME/checkpoints`) is explicitly skipped to avoid recursive zip bloat.

## Tests

`cargo test -p houston-engine-core checkpoints::` — 3 tests covering create-and-list round trip, restore-recovers-deleted-file, delete-removes-checkpoint. All run against `tempfile::TempDir` so they don't touch the real `$HOUSTON_HOME`.

## See also

- `knowledge-base/feature-flags.md` — the 12 rules
- Sibling flags: `advanced-worktrees.md`, `advanced-context-meter.md`, `advanced-git-panel.md`, `advanced-timeline.md`
- RFC: `gethouston/houston#248`
