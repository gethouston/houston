import { orgStanding } from "../billing/recovery";
import type { OrgSummary, OrgsList } from "./types";

export interface MoveOutDestination {
  slug: string;
  name: string;
  personal: boolean;
}

const manages = (org: OrgSummary) =>
  org.role === "owner" || org.role === "admin";

export function canMoveAgentsOut(
  source: OrgSummary | null | undefined,
): boolean {
  return source != null && source.billing !== null && manages(source);
}

export function moveOutDestinations(
  orgs: OrgsList | undefined,
  sourceSlug: string,
): MoveOutDestination[] {
  return (orgs?.orgs ?? [])
    .filter(
      (org) =>
        org.slug !== sourceSlug &&
        manages(org) &&
        orgStanding(org.billing, org.degraded) !== "locked",
    )
    .map((org) => ({
      slug: org.slug,
      name: org.name,
      personal: org.kind === "personal",
    }))
    .sort(
      (a, b) =>
        Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name),
    );
}
