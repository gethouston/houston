import type { AuditEntry, Capabilities } from "@houston/engine-adapter";
import { canSeeMembers, isPersonalSpace } from "../../lib/org-roles.ts";

/**
 * Pure, DOM-free logic for the Organization dashboard (Teams v2 + C8 billing).
 * Extracted from the view so the visibility gate + tab set are unit-tested in
 * isolation (node:test), never importing React.
 */

/**
 * The sections of Admin. The workspace's Company context is not one of them:
 * it is a header tool that opens its editor in a sheet over whichever section
 * is showing. Per-agent policy lives in each team's focused agent screen.
 */
export type OrgTabId = "orgChart" | "people" | "billing" | "activity";

/**
 * The section the dashboard lands on: what the header's identity lozenge
 * stands for, the same way a team's lozenge IS its board. The lozenge says
 * "Workspace", and the org chart is the workspace drawn whole.
 */
export const DEFAULT_ORG_TAB: OrgTabId = "orgChart";

/**
 * The sections of a team space. `billing` is the only conditional one, added
 * by {@link orgTabIds} where `canSeeBillingTab` holds; see that function for
 * the authoritative display order.
 */
export const ORG_TAB_IDS: readonly OrgTabId[] = [
  "orgChart",
  "people",
  "activity",
] as const;

/**
 * The tab ids in display order, written out literally so the order reads off
 * the source: Org chart (the identity lozenge and landing section), then
 * People, Billing when `canSeeBillingTab` (in `lib/billing-gates`) holds, then
 * Activity. A personal space has no roster to administer, so it keeps the Org
 * chart and, where it bills, its Billing. Pure so the tab set is unit-tested without React; the view maps
 * each id to its component + `t()` label.
 *
 * The Org chart takes no gate of its own: the whole dashboard is mounted
 * behind {@link canSeeOrganization}, including in a Spaces personal space.
 */
export function orgTabIds(gates: {
  billing: boolean;
  personal: boolean;
}): readonly OrgTabId[] {
  if (gates.personal)
    return gates.billing ? ["orgChart", "billing"] : ["orgChart"];
  return [
    "orgChart",
    "people",
    ...(gates.billing ? (["billing"] as const) : []),
    "activity",
  ];
}

/**
 * Whether the organization gate admits the Admin dashboard.
 *
 * On a C8 Spaces host the personal space has a sole caller who owns it, so the
 * dashboard is available there. On a non-spaces multiplayer host (exactly one
 * org) there is no personal/team split, so `activeSpaceIsTeam` is irrelevant
 * and the gate falls through to the members-roster rule.
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
  if (isPersonalSpace(caps, activeSpaceIsTeam)) return true;
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
