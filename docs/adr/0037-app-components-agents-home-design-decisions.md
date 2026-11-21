# app/src/components/agents-home: design decisions

Covers `app/src/components/agents-home/`: the phone's Agents home chat list and its filters. File paths in this record are relative to that folder.

## The phone's Agents home is a chat list over the one sweep

Every agent is a chat-list row: large avatar, name, latest movement time, a preview line and the needs-you badge. Rows read the same one-sweep `all-conversations` query and the same per-agent summaries (`useAgentActivitySummaries`) as every badge surface, with no fetch path of their own, so a row chip never disagrees with the badge that led there and rows repaint through normal event invalidation. While the sweep has no data, placeholder rows show so the list never claims agents are idle.

Lives in `app/src/components/agents-home/agents-home-list.tsx`, `agents-home-model.ts`.

## Ordering and preview

Agents waiting on the user come first, then agents with running work, then the rest; inside each band the most recently active agent leads and name breaks exact ties, so order is stable across refetches. The preview is the latest task's title (not a message, since an agent is a thread of many conversations); on a timestamp tie the first row in sweep order wins. A working agent previews "Typing" in the success tone, matching the avatar ring; an agent with nothing says so. Setup chats and archived tasks never count as visible work.

Lives in `agents-home-model.ts`, `agent-home-row.tsx`.

## Group filter

A store preference, not a nav level, so drilling in and back keeps it. A chosen id the roster no longer holds resolves to all groups, widening rather than emptying the list. It is a menu, not chips, because a person may hold more groups than fit across a phone and an off-screen filter is invisible. The pill has no `aria-label` so the visible current choice is its name. The AI Manager row is pinned above the roster, belongs to no team, is never filtered, and is gated on `useManagerReachable` like the rail row; tapping pushes the assistant chat.

Lives in `agents-home-team-filter.tsx`, `agents-home-header.tsx`, `manager-home-row.tsx`.

## Phone carries group and create actions

The phone has no rail, so New group, the group menu and New AI Employee live in the header with `md:hidden`. The create control carries the rail's `newAgent` anchor on phones so the tutorial spotlight finds whichever is visible.

Lives in `agents-home-header.tsx`.

## Avatar stack

An agent with two or more visible tasks shows a fan of three cards; at most one task shows a single mark, since a stack would promise a list that is not there. Back cards are a step smaller so the fan reads as depth, and each sits on an opaque disc with a background hairline so same-colored metal does not melt into one shape. The mark is decorative and hidden from assistive tech. Only the front card carries the running ring, via `HoustonAvatar`.

Lives in `agent-avatar-stack.tsx`.

## Per-agent task list

Sections use the board's own `missionColumnIdForStatus`, so a mission sits in the same section as its desktop column. Empty bands vanish. The archive exists only under "All", at the bottom; the menu's Archived action resets the segment to reach it. The header counts only live work, so a finished agent does not look busy. Every row, archived included, opens as the pushed chat. The menu is the phone's only door to the employee's other sections; Settings opens in place so its back chip returns to the list. With no tasks, the first-day hero is the screen, and while config loads it holds rather than flash "No tasks".

Lives in `agent-missions-model.ts`, `agent-missions-list.tsx`, `agent-missions-screen.tsx`, `agent-missions-menu.tsx`, `use-agent-missions-settings.ts`.

## Published task targets on phones

A published target (notification, command palette, a new agent's first-day task) opens only on the employee's task list, and only if the sweep names it as this employee's or it is the one just created (the create publishes before the sweep lists it). A target published just before the nav reaches its employee must not open on the list being left. A pushed chat is never replaced; a target matching it is consumed. The hook listens only below the breakpoint and while its screen is visible; desktop boards consume targets themselves.

Lives in `agent-missions-target.ts`, `use-drill-in-mission-target.ts`.

## Drill by id

The drilled agent is a nav-stack level keyed by id, so a deleted agent or a roster reload falls back to the list instead of rendering a ghost.

Lives in `agents-home-view.tsx`.

## Tags and visual tests

Status tag color is semantic: warning for waiting on the user, success for running, neutral otherwise. The origin tag is always neutral and truncates long names. Relative times carry `data-relative-time` so the visual suite masks the live clock.

Lives in `mission-status-tag.tsx`, `mission-origin-tag.tsx`, `agent-home-row.tsx`, `agent-mission-row.tsx`.
