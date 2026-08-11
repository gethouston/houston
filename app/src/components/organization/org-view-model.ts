import type { AuditEntry, Capabilities } from "@houston-ai/engine-client";
import { canSeeMembers, isPersonalSpace } from "../../lib/org-roles.ts";
import { showComputeSection } from "../time-worked/compute-usage-model.ts";

/**
 * Pure, DOM-free logic for the Organization dashboard (Teams v2 + C8 billing).
 * Extracted from the view so the visibility gate + tab set are unit-tested in
 * isolation (node:test), never importing React.
 */

/**
 * The sections of the Admin dashboard. Company context is the workspace half
 * of the standing context every agent
 * starts a turn with. Per-agent policy is NOT here: it is reached through each
 * team's focused agent screen.
 */
export type OrgTabId =
  | "companyContext"
  | "people"
  | "billing"
  | "activity"
  | "usage"
  | "timeWorked";

/**
 * The section the dashboard lands on: what the header's Admin identity
 * lozenge stands for, the same way a team's lozenge IS its board. The section
 * titles itself in its body (the lozenge says "Admin", not "Company
 * context"), and the rail's Admin row always returns here.
 */
export const DEFAULT_ORG_TAB: OrgTabId = "companyContext";

/**
 * The always-present sections. `billing` (C8) is the only conditional one, added
 * by {@link orgTabIds} on a Spaces host, in a team space, for owner/admin — see
 * that function for the authoritative display order.
 */
export const ORG_TAB_IDS: readonly OrgTabId[] = [
  "companyContext",
  "people",
  "activity",
  "usage",
] as const;

/**
 * The dashboard's tab ids in display order, written out literally so the order
 * reads off the source: Company context (the identity lozenge and landing
 * section), then People, then Billing when `canSeeBillingTab` (in
 * `lib/billing-gates`) holds, then Activity, Usage, and gated Time worked. Pure so the tab set is
 * unit-tested without React; the view maps each id to its component + `t()`
 * label.
 *
 * Company context takes no gate of its own on purpose: the whole Admin view is
 * mounted only behind {@link canSeeOrganization}, which is false on a personal
 * space (`isPersonalSpace`), so "org spaces only" is already enforced one level
 * up and a second branch here would be dead code.
 */
export function orgTabIds(gates: {
  billing: boolean;
  timeWorked: boolean;
}): readonly OrgTabId[] {
  return [
    "companyContext",
    "people",
    ...(gates.billing ? (["billing"] as const) : []),
    "activity",
    "usage",
    ...(gates.timeWorked ? (["timeWorked"] as const) : []),
  ];
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
  if (isPersonalSpace(caps, activeSpaceIsTeam)) return true;
  return canSeeMembers(caps);
}

export function canSeeTimeWorked(
  caps: Capabilities | null | undefined,
): boolean {
  return showComputeSection(caps);
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
