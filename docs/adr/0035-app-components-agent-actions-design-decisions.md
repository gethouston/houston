# app/src/components/agent-actions: design decisions

Covers `app/src/components/agent-actions/`: agent-level actions such as copying an agent into another team. File paths in this record are relative to that folder.

## Copying an agent reuses existing surfaces

A copy is built from the agent-scoped portable routes (the same set "Export a copy" carries), installed as an ordinary create-with-seeds, then moved into the chosen team. This works on both backends. The copy is born on the source's provider and model through the install, and has no first day because it already knows its job. Chats move afterwards through the agent-scoped migration routes in the background, because on the hosted profile the copy's pod may still be cold-starting; a waking refusal on that import is waited out, not reported. A rejected file or a board the copy already had is reported as a partial copy; only a complete copy gets the success toast. Failures toast and resolve `false` so the dialog stays open.

Lives in `app/src/components/agent-actions/use-copy-agent.ts`.

## What a copy carries

A copy carries the whole portable surface (job description, skills, routines, learnings). Conversations, files and connected accounts are not part of that surface.

Lives in `copy-agent-model.ts`.

## Copy naming

Agent names are unique per workspace, not per team, so copying into the same team is allowed. The default name is the first free "<name> copy" / "<name> copy N", compared with the host's `agentNameKey`, capped at `maxLength` by trimming the base name so the suffix survives. When all candidates are taken the first is returned anyway and live validation asks for a rename. A 409 from a sibling taking the name after the live check keeps the form open with the typed name. The dialog re-seeds on each opening because the free name and home team change while it is closed.

Lives in `copy-agent-model.ts`, `agent-copy-action.tsx`, `use-copy-agent.ts`.

## Identity save is sequenced

"Change color & name" saves only fields that moved, so an untouched field never overwrites someone else's change. The rename runs before the color write because a rename moves the folder-derived id; the color targets the id the rename settles on on the wire. A refused rename still applies the color to the old id. Both halves are optimistic; on refusal the promise rejects after the row is restored, and callers must await it. The name check sends nothing for an unchanged name and passes the agent's own name so it can take a new spelling of itself.

Lives in `use-agent-identity-save.ts`, `agent-identity-dialog.tsx`.
