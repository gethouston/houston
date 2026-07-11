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
