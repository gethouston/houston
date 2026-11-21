# app/src/components/agent-settings: design decisions

Covers `app/src/components/agent-settings/`: the single settings page for one agent, its sections, people and API access. File paths in this record are relative to that folder.

## One canonical settings page, two doors

Configuring a single agent is one page with one nav model, reached from the employee's own Settings section and from Settings > Permissions in multiplayer. The page carries no authority: reaching it is gated by `visibleAgentSections` (managers only) and the gateway is the sole enforcer. Settings leads the rail and is the default landing section, because the page's door is administering the agent. Every section branch composes the existing section component rather than re-implementing it. Flush sections own no width; the mounting surface gives every section the same `max-w-3xl px-6` column so nothing shifts as the rail switches.

Lives in `app/src/components/agent-settings/agent-settings-page.tsx`, `agent-settings-nav.ts`, `agent-settings-section.tsx`.

## Section visibility

People needs multiplayer (single player has no roster); the app and model ceilings also need a Teams-capable host. A single-player rail is Context plus Skills only. Skills has no org gate. A locked org turns controls off, but moving the AI Employee to another org stays open since that is how one empties a locked org.

Lives in `agent-settings-nav.ts`, `agent-settings-section.tsx`, `agent-settings-manage.tsx`, `agent-settings-org-move.tsx`.

## Deep links survive the capabilities load

`/v1/capabilities` lands after first render, so a deep-link request is retained until honored once, then retired so later capability reloads never move the user off a section chosen by hand. A request naming a hidden section falls back within its own group (an Apps request is a Permissions intent), and only to the rail's first item if the group is absent.

Lives in `agent-settings-selection.ts`.

## Access choice maps faithfully to the wire

The wire has two states: an empty assignee set means everyone in the org, any explicit set means exactly those people (`PUT /v1/agents/:slug/assignments`, set-replace). "Only specific people" materializes the roster the sentinel currently expands to (every member, owner as manager), changing nobody's access. The empty set cannot carry Manager grants, so switching to Everyone demotes non-owner managers. Both directions are confirm-gated: a self-lockout warning (destructive) when the viewer holds a non-owner Manager grant, an informational confirm when someone else's access changes, and a snapshot confirm for specific people stating how many are frozen and that future teammates are excluded. A pure no-op writes straight through. The choice is hidden until the roster is readable, since with no members "Only specific people" would write the empty set and mean the opposite.

Lives in `agent-people-choice.ts`, `agent-people-confirm.tsx`, `agent-settings-people.tsx`.

## Roster reuses the Share dialog's model

Roster rows reuse the Share dialog's `agent-access-model` primitives (`buildSharePeople`, `applyShareAction`, `needsSelfLockoutConfirm`) so both surfaces derive access and write rosters identically. Every org member gets a row, so the owner can grant, not only revoke. The org owner is always Manager and never editable. Only org owner/admin may hold a Manager seat. Rows sort by the name each row shows. The resolved roster count is what the section and rail badge show, not the raw assignments array.

Lives in `agent-people-model.ts`, `agent-people-tab.tsx`, `agent-person-row.tsx`.

## One write channel

The section owns a single optimistic `useShareAgent` passed to the roster, so one in-flight write disables every control and two set-replaces never race into a lost update. In Everyone mode the roster is static: a live control would silently materialize the roster, mirroring the `AllowlistEditor` "any" mode. The gateway serves the member list only to owner/admin, so a manager who is a plain member sees an honest viewer line instead of an empty state.

Lives in `agent-settings-people.tsx`, `agent-people-tab.tsx`, `agent-people-model.ts`.

## Share affordance

The agent's one Share affordance lives in People because it invites people. The read-only "view" variant is not offered, since the pane already lists who has access.

Lives in `agent-settings-people.tsx`.

## Manage writes

Name, color and delete are optimistic and reject only after `useAgentActions` rolled back and told the person; the handler awaits them to keep the rejection from escaping, adding no second surface.

Lives in `use-agent-manage-writes.ts`.

## API access

The API details block (setup prompt from the SDK's `apiSetupPrompt`, never a key, plus Agent ID and Organization ID) is shared by the employee's API access screen and the AI Manager's chat card, so they never hand out different values. It mounts only where `capabilities.apiKeys` says the public API is served. On the hosted gateway the agent's client-side id is its public slug.

Lives in `agent-api-details.tsx`, `agent-api-access.tsx`.
