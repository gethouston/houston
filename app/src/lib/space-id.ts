/**
 * Space (org) identity helpers for the workspace switcher.
 *
 * C8 (`cloud/docs/contracts/C8-spaces-billing.md`, §Workspaces bridge) bridges
 * team spaces into the existing switcher: `GET /v1/workspaces` returns the
 * caller's personal workspace (opaque id, never `org:`-prefixed) plus one row
 * per team, each with id `"org:" + slug` where slug is exactly 16 lowercase hex
 * chars. Selecting a team workspace pins `x-houston-org: <slug>` (and `?org=` on
 * the two SSE routes); selecting personal sends no header.
 *
 * These pure, DOM-free helpers are the single source of truth for that id
 * grammar, so the switch wiring keys off the id alone. The list self-gates: a
 * host that returns no team rows never produces a team id, so behaviour stays
 * byte-identical to a single-workspace deployment (no capability flag needed).
 */

/** Exactly `org:` + 16 lowercase hex chars. Nothing else is a team space. */
const TEAM_WORKSPACE_ID = /^org:([a-f0-9]{16})$/;

/**
 * The org slug a workspace id pins as the active space, or `null` when the id
 * is a personal (opaque, non-`org:`) workspace. A `null` result means "send no
 * active-space header" — the gateway resolves the caller's personal org.
 */
export function orgSlugFromWorkspaceId(id: string): string | null {
  const match = TEAM_WORKSPACE_ID.exec(id);
  return match ? match[1] : null;
}

/** True when a workspace id addresses a team space (`org:<16-hex>`). */
export function isTeamWorkspace(id: string): boolean {
  return orgSlugFromWorkspaceId(id) !== null;
}

/**
 * The personal workspace's client-side id. It is SYNTHETIC: the adapter
 * substitutes this row for whatever the host serves (`workspaces-mixin.ts`
 * `listWorkspaces`) because the id is load-bearing for prefs, caches and the
 * desktop boot path.
 *
 * The adapter spells the same value `DEFAULT_WORKSPACE_ID`
 * (`packages/web/src/engine-adapter/synthetic.ts`) and keeps its own copy for
 * the same reason `teamSlugFromWorkspaceId` does: `packages/web` never imports
 * from `app/`. The two must stay equal.
 */
export const PERSONAL_WORKSPACE_ID = "default";

/**
 * Whether a server event's workspace id addresses the workspace the user has
 * open — the gate on every workspace-scoped invalidation.
 *
 * The two sides speak DIFFERENT vocabularies for the personal space and a
 * string compare between them is always false: the client holds the synthetic
 * {@link PERSONAL_WORKSPACE_ID}, while an event carries the SERVER's id — the
 * local host's on-disk folder name (`~/.houston/workspaces/<Name>`) or the
 * gateway's fixed engine id. An agent that the assistant created therefore
 * emitted `AgentsChanged`, reached the app, and was dropped by the guard: the
 * new agent stayed invisible until a manual refresh.
 *
 * Team spaces are the only ids both sides spell identically (`org:<slug>`), so
 * they still match exactly and never leak into another space; anything that is
 * NOT a team id belongs to the personal space by construction, which is what
 * makes the personal case decidable without a round trip.
 *
 * An event with no workspace id at all names no space to exclude — the open one
 * is the only one this window can act on, so it applies (a stale surface is the
 * one outcome this pipeline may never produce).
 */
export function eventTargetsOpenWorkspace(
  eventWorkspaceId: string | undefined,
  openWorkspaceId: string | undefined,
): boolean {
  if (!openWorkspaceId) return false;
  if (!eventWorkspaceId) return true;
  if (eventWorkspaceId === openWorkspaceId) return true;
  if (openWorkspaceId !== PERSONAL_WORKSPACE_ID) return false;
  return !isTeamWorkspace(eventWorkspaceId);
}
