import type { AuditEntry, Capabilities } from "@houston-ai/engine-client";
import { canSeeMembers } from "../../lib/org-roles.ts";

/**
 * Pure, DOM-free logic for the Organization dashboard (Teams v2). Extracted from
 * the view so the visibility gate + tab set are unit-tested in isolation
 * (node:test), never importing React.
 */

/** The sections of the Organization dashboard, in tab order. */
export type OrgTabId = "people" | "agents" | "activity" | "usage";

/** Tab ids in display order. Labels are supplied by the app via `t()`. */
export const ORG_TAB_IDS: readonly OrgTabId[] = [
  "people",
  "agents",
  "activity",
  "usage",
] as const;

/**
 * Whether the Organization view — and its sidebar nav entry — should render at
 * all. True only for a multiplayer owner/admin; single-player and plain members
 * never see it. This is exactly the members-roster gate (`canSeeMembers` is
 * already "multiplayer AND owner|admin": `orgRole` returns null off-multiplayer
 * and the least-privileged `user` otherwise), so the dashboard and the roster
 * share one source of truth. The gateway is the real enforcer; this only hides
 * an affordance the user can't act on.
 */
export function canSeeOrganization(
  caps: Capabilities | null | undefined,
): boolean {
  return canSeeMembers(caps);
}

/** How many audit entries one page pulls (contract §5: host clamps to ≤ 200). */
export const AUDIT_PAGE_SIZE = 50;

/**
 * The before-cursor for the NEXT audit page, or `undefined` when the tail was
 * reached. A short page (fewer than `AUDIT_PAGE_SIZE`) proves there's nothing
 * older; otherwise page again strictly before the oldest (last) entry's id.
 * Pure so the paging boundary is unit-tested without React Query. Audit rows
 * arrive newest-first, so the last row is the oldest → the next cursor.
 */
export function nextAuditCursor(lastPage: AuditEntry[]): number | undefined {
  if (lastPage.length < AUDIT_PAGE_SIZE) return undefined;
  return lastPage[lastPage.length - 1]?.id;
}
