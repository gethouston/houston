import type { AuditEntry, Capabilities } from "@houston-ai/engine-client";
import { canSeeMembers } from "../../lib/org-roles.ts";

/**
 * Pure, DOM-free logic for the Organization dashboard (Teams v2 + C8 billing).
 * Extracted from the view so the visibility gate + tab set are unit-tested in
 * isolation (node:test), never importing React.
 */

/** The sections of the Organization dashboard, in tab order. */
export type OrgTabId =
  | "people"
  | "agents"
  | "activity"
  | "usage"
  | "allowedIntegrations"
  | "allowedModels"
  | "billing";

/**
 * The always-present sections, in display order. The rest are appended
 * conditionally by {@link orgTabIds}: the two policy tabs only on a Teams host
 * (a host that predates Teams has no `/org/settings` route to edit), `billing`
 * (C8) only on a Spaces host, in a team space, for owner/admin.
 */
export const ORG_TAB_IDS: readonly OrgTabId[] = [
  "people",
  "agents",
  "activity",
  "usage",
] as const;

/** The org policy ceilings (Teams v2): appended only when `caps.teams`. */
export const POLICY_TAB_IDS: readonly OrgTabId[] = [
  "allowedIntegrations",
  "allowedModels",
] as const;

/**
 * The dashboard's tab ids in display order: the fixed set, plus the policy
 * ceilings when the host serves Teams (`caps.teams`), plus `billing` when
 * `canSeeBillingTab` (in `lib/org-roles`) holds. Pure so the tab set is
 * unit-tested without React; the view maps each id to its component + `t()`
 * label.
 */
export function orgTabIds(gates: {
  policy: boolean;
  billing: boolean;
}): readonly OrgTabId[] {
  return [
    ...ORG_TAB_IDS,
    ...(gates.policy ? POLICY_TAB_IDS : []),
    ...(gates.billing ? (["billing"] as const) : []),
  ];
}

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
