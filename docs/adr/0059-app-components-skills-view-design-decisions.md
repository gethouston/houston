# app/src/components/skills-view: design decisions

Covers `app/src/components/skills-view/`: an agent's Skills section and the workspace-shared skills store. File paths in this record are relative to that folder. This module implements the client side of ADR 0003 (workspace-shared skills store). The surface reads both models through `useSkillsModels` so it never branches on which one the deployment serves.

## Two skill models

Where `capabilities.sharedSkills` is served (false on every cloud profile), a workspace skill lives once in the store and an employee loads it through its manifest: content is one store write, assignment is reversible per-agent manifest toggles, and an agent's divergent local copy is an override. Otherwise skills are copies stored on each agent, and every operation is N calls to per-agent routes, because there is no shared store and the hosted gateway only proxies agent-scoped routes. On a shared-store deployment a local row never offers copy fan-out; multi-agent use goes through "Share to workspace" so the holder list is not mistaken for org-level assignment.

Lives in `app/src/components/skills-view/use-skills-models.ts`, `use-shared-skills.ts`, `use-skills-view-actions.ts`, `use-skill-detail-surface.ts`.

## Manifest writes are serialized in the SDK

The manifest route replaces the whole list, so per-agent read-modify-write is serialized in the SDK; entries are written one at a time. Ordering for paired acts also lives in the SDK: "Disable for this AI Employee" turns the manifest entry off and drops the shadowing copy (a local copy loads with or without an entry, so both are needed); "Use workspace version" turns the entry on before dropping the copy, since the reverse order leaves the agent with neither.

Lives in `use-shared-skills-actions.ts`, `use-shared-skill-assignments.ts`, `skill-editor-props.ts`.

## Optimistic writes and partial failure

Assignments, deletes and adds paint immediately and resolve before the host answers, so the editor can leave at once; a refusal restores every cache, refetches and toasts once. A delete whose manifest write failed leaves some employee loading a deleted skill, so a partial delete is a refusal. Content saves and promotes re-throw so the editor keeps the typed work. Assignment writes are `async` because the warming guard throws synchronously and a throw before the promise exists would skip the rollback. "Share to workspace" moves the first holder's copy into the store, adds manifest entries for holders and deletes only byte-identical copies; divergent copies remain as overrides. Sharing from an employee's editor puts that employee's copy first.

Lives in `use-shared-skills-actions.ts`, `use-shared-skill-assignments.ts`, `use-skills-view-actions.ts`, `workspace-skill-acts.ts`.

## Scoping rows to one employee

The store lists every skill it holds, so an employee's section narrows rows to skills that employee loads. A local copy shadowing a store slug is folded into the shared row as an override; read through the store row, the section would save to the store and rewrite the skill for every employee while this one keeps its copy, so scoped rows point at the employee's local copy and keep the override mark. Until the employee's own list is read (`undefined`, distinct from an empty map) rows stay as the aggregate resolved them, so a row does not rename itself on screen. A row the two reads disagree about is held back until they agree.

Lives in `skills-scope.ts`, `use-scoped-skill-rows.ts`.

## What an employee runs

The setup chat resolves a skill by slug from the list it is given, so it receives what each employee runs (own copies plus loaded store skills), with the own copy winning on a shared slug. `undefined` means still loading; an empty list would settle the claim heuristics prematurely.

Lives in `effective-skills.ts`, `use-skill-create-flow.tsx`.

## Workspace-wide acts need every holder

Share, Enable for all and Delete for all are decided on the workspace row, never the narrowed one, and only for the space owner (`manageWorkspaceSkills`). The menu reads every employee's skills only while it is open, so opening one section wakes no one else. Nothing is offered until every read's latest attempt answered; cached data is not enough because a silenced refusal keeps an old list. A copy this employee alone holds is the section's own Delete, not offered twice.

Lives in `workspace-skill-menu-items.tsx`, `workspace-skill-acts.ts`.

## Add an existing skill

Only store skills the employee does not load are offered; adding is a manifest write, never a copy, and a skill living only as another employee's copy is not offered because the client has no move behind it. Without a store the item is absent. The dialog stays open so several can be added. Each row's "Add" button carries the skill name in its accessible name.

Lives in `addable-skills.ts`, `use-add-existing-skill.tsx`, `add-existing-skill-dialog.tsx`.

## Fetch discipline

Per-agent skill lists use the per-agent `queryKeys.skills(path)` keys, fetched once and then event driven (`SkillsChanged`, `SharedSkillsChanged`); focus and staleness refetches are disabled because each hosted fetch wakes that agent's pod and resets its idle clock. Manifest reads wait for the roster to settle and silence 404 and 403, so a space switch does not toast "agent not found" for gone agents; such agents are not failures. A partial read keeps the rows that landed. An explicit refetch runs disabled queries too, so the store is not refetched where unsupported.

Lives in `use-workspace-skills.ts`, `use-shared-skills.ts`, `use-skills-models.ts`, `skills-view.tsx`.

## Editor draft and live updates

The editor reads the same query key as the list, so a chat rewriting SKILL.md moves the open editor. An untouched draft follows the server; a server copy equal to the screen is the user's own save and adopts silently; a genuine divergence keeps the draft and offers a reload, raising the flag once so the render-time reconcile cannot loop. The new baseline is adopted only when a save lands, or Save would disable after a failed write. A rename edits the frontmatter `title:` and never moves the slug. Every way out of a dirty editor goes through the discard confirm. Skills Houston wrote open on the workflow view; imported skills open on markdown; an explicit pick wins.

Lives in `skill-editor-model.ts`, `use-skill-editor.ts`, `use-skill-detail-surface.ts`, `skill-editor-page.tsx`.

## Missing skill

A 404 on the detail read means the skill was deleted elsewhere: one calm toast, leave the editor and refetch the list (the detail key shares the "shared-skills" prefix, so one invalidation clears both). Other load errors keep the editor with an inline retry.

Lives in `use-missing-skill-dismiss.ts`.

## Scoped acts

"Disable for this AI Employee" and "Use workspace version" ask first only when they delete the employee's own version, which nothing restores; the dirty-draft confirm is about unsaved text and does not cover that. Both acts leave the editor, but only while that editor is still on screen, because the user may have opened another skill and leaving would discard its draft. A ref guards double presses within one frame. The override notice sits in the editor because it answers which copy a save writes before the user types.

Lives in `scoped-skill-actions.ts`, `use-scoped-skill-acts.ts`, `skill-override-notice.tsx`, `skill-editor-confirms.tsx`.

## Navigation and chat

The open skill is held by slug and re-resolved from live rows every render; a slug briefly missing (roster reload) keeps its last row, and the detail 404 is the authority on deletion. Entering the editor opens its chat once per entry; on phones the panel covers content, so the chat waits for the "Open chat" pill. A skill-chat notification's activity id is spent by whoever resolves it (open or drop), because a phone does not auto-mount the chat and a leftover id would reopen the editor on every Back and take over the next chat; an editor already on screen is not displaced. The chat host closes when an observed selection clears, guarded against the mount commit. A freshly created skill may move from the local list to the store just after the claim, so the chat falls back to a minimal row and resolves by its reverse stamp.

Lives in `use-skills-editor-nav.ts`, `skill-editor-model.ts`, `skill-chat-pane.tsx`, `skills-view.tsx`.

## Unfinished creation chats

Setup chats are kept off mission boards, so an unfinished creation chat is listed only here, above the skills and outside their count and search, showing when it was last worked on. Rows wait for settled data, because a cold open serves the cross-agent cache as a placeholder without `skill_slug` stamps and every shipped skill's chat would appear as unfinished. Create and resume decisions wait for settled data too; a named chat no longer unfinished closes the pane. The open pane's unclaimed chat is not drawn as a second row.

Lives in `use-unfinished-skill-drafts.ts`, `skill-draft-rows.tsx`, `use-skill-chat-open.ts`, `use-skill-create-flow.tsx`.

## List states and layout

Empty, no-match, failed and loading are distinct states; a search over an empty workspace is still the empty state. The section header shows only over rows. The failure state has a retry and no error text because the engine call already toasted. Skeletons match `CatalogRow` geometry and reserve the controls in the form they will take. The editor header uses the list header's 48px strip geometry so opening a skill does not shift the body. The editor body uses `dvh` and 16px text on phones to avoid zoom. The surface adds no scroller inside the settings rail's. A locked org reads every skill and writes none.

Lives in `skills-list-model.ts`, `skills-list-states.tsx`, `skill-editor-header.tsx`, `skill-body-editor.tsx`, `skills-surface-frame.tsx`, `skills-ready.tsx`.
