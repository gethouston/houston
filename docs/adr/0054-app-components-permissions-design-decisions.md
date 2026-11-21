# app/src/components/permissions: design decisions

Covers `app/src/components/permissions/`: the agent detail page reached from Settings > Permissions. File paths in this record are relative to that folder.

## Configuring an agent is a manager's job, with one door

The agent detail page opens one agent on the canonical `AgentSettingsPage`: its Context and its Permissions in one master-detail surface. The only door is the agent's own Settings section, which `visibleAgentSections` offers only to its managers, so every section renders its editable face. The gateway is the real enforcer of permissions.

Lives in `app/src/components/permissions/agent-detail.tsx`.

## The agent is resolved live by id

The shell resolves the agent from the store by id, not from a snapshot, so a share mutation that reloads the store shows fresh data. The Share affordance lives in the People section, since it is the invite door.

Lives in `agent-detail.tsx`.

## Job description takes the full column height

The job description's pinned card fills the column; the outer scroller stays only as a short-window fallback. Every other section page-scrolls with the usual bottom padding.

Lives in `agent-detail.tsx`.

## Header: identity on the back chip

The back chip carries the agent's avatar and name, so every lozenge is a plain section tab. The h1 follows the active section through `DrilledHeader`; the first lens is flagged only so a heading stays on the strip when the active id names no section, matching Admin.

Lives in `agent-detail-header.tsx`.
