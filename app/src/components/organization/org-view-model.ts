import type { AuditEntry, Capabilities } from "@houston-ai/engine-client";
import { canSeeMembers, hasSpaces } from "../../lib/org-roles.ts";

/**
 * Pure, DOM-free logic for the Organization dashboard (Teams v2 + C8 billing).
 * Extracted from the view so the visibility gate + tab set are unit-tested in
 * isolation (node:test), never importing React.
 */

/**
 * The sections of the Organization dashboard, in tab order. Permissions (who can
 * use which agent, each agent's ceilings, the org-wide defaults) moved OUT to
 * the top-level Permissions view; the Organization dashboard is now membership +
 * insights + billing only.
 */
export type OrgTabId = "people" | "activity" | "usage" | "billing";

/**
 * The always-present sections, in display order. `billing` (C8) is appended
 * conditionally by {@link orgTabIds} only on a Spaces host, in a team space, for
 * owner/admin.
 */
export const ORG_TAB_IDS: readonly OrgTabId[] = [
  "people",
  "activity",
  "usage",
] as const;

/**
 * The dashboard's tab ids in display order: the fixed set, plus `billing` when
 * `canSeeBillingTab` (in `lib/org-roles`) holds. Pure so the tab set is
 * unit-tested without React; the view maps each id to its component + `t()`
 * label.
 */
export function orgTabIds(gates: { billing: boolean }): readonly OrgTabId[] {
  return [...ORG_TAB_IDS, ...(gates.billing ? (["billing"] as const) : [])];
}

/**
 * Whether the Organization view — and its sidebar nav entry — should render at
 * all, plus the Permissions view, which shares this gate exactly.
 *
 * On a C8 Spaces host the personal space is single-player semantics
 * (non-invitable, no roster, no policy — the gateway 403s a member-add with
 * `personal_space`), so the org dashboard and Permissions are TEAM-space
 * surfaces: they hide whenever the active space is personal, whatever the role.
 * On a non-spaces multiplayer host (legacy Teams v2, exactly one org) there is
 * no personal/team split, so `activeSpaceIsTeam` is irrelevant and behavior is
 * unchanged — the gate falls through to the members-roster rule.
 *
 * That base rule is exactly the members-roster gate (`canSeeMembers` is already
 * "multiplayer AND owner|admin": `orgRole` returns null off-multiplayer and the
 * least-privileged `user` otherwise), so the dashboard and the roster share one
 * source of truth. The gateway is the real enforcer; this only hides an
 * affordance the user can't act on.
 */
export function canSeeOrganization(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  if (hasSpaces(caps) && !activeSpaceIsTeam) return false;
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
