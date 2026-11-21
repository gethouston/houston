import type { AuditEntry, Capabilities } from "@houston/engine-adapter";
import { canSeeMembers, isPersonalSpace } from "../../lib/org-roles.ts";

export type OrgTabId = "orgChart" | "people" | "billing" | "activity";

export const DEFAULT_ORG_TAB: OrgTabId = "orgChart";

export const ORG_TAB_IDS: readonly OrgTabId[] = [
  "orgChart",
  "people",
  "activity",
] as const;

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

export function canSeeOrganization(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  if (isPersonalSpace(caps, activeSpaceIsTeam)) return true;
  return canSeeMembers(caps);
}

export const AUDIT_PAGE_SIZE = 50;

export function nextAuditCursor(lastPage: AuditEntry[]): number | undefined {
  if (lastPage.length < AUDIT_PAGE_SIZE) return undefined;
  return lastPage[lastPage.length - 1]?.id;
}
