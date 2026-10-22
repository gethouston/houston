import { orgStanding } from "../billing/recovery";
import type { OrgSummary, OrgsList } from "./types";

/** An org an AI Employee can move into: where it lands, and whether it is Personal. */
export interface MoveOutDestination {
  slug: string;
  name: string;
  personal: boolean;
}

const manages = (org: OrgSummary) =>
  org.role === "owner" || org.role === "admin";

/**
 * Whether the caller can move an AI Employee out of `source` into another
 * org: an owner or admin of an org on org billing (`billing` set), locked
 * or not. A `legacy` org sends no billing and keeps the old rule, where only
 * the Personal space moves agents into a team.
 */
export function canMoveAgentsOut(
  source: OrgSummary | null | undefined,
): boolean {
  return source != null && source.billing !== null && manages(source);
}

/**
 * Where the caller can move an AI Employee out of `sourceSlug`: every other
 * org they own or run that is not locked, Personal included, Personal first
 * and then by name. The gateway refuses a locked destination, so none is
 * offered.
 */
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
