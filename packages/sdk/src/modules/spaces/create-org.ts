/**
 * The org create call (`POST /v1/orgs`), over the injected `fetch`. Its own
 * file because a create answers more than an org: the free slot already taken
 * and a paid org awaiting checkout are outcomes the caller renders, never
 * failures.
 */

import { FREE_ORG_TAKEN, readCreatedOrg } from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { freeOrgTakenSlug } from "./create-refusals";
import type { CreateOrgOutcome, OrgPlan } from "./types";

/**
 * Creates a shared space the user can invite teammates into.
 *
 * Create an organization, free unless `plan` says `paid`. Each account owns
 * one free organization at a time: while that slot is taken a free create
 * answers `free_org_taken` with the slug of the org holding it, and nothing is
 * created. A paid create answers `checkout`: the org exists, locked until the
 * owner completes the checkout at `checkoutUrl`. NOT idempotent: on a lost
 * response DON'T blind-retry; reconcile via `listOrgs` and reuse the persisted
 * slug. Every other failure throws so the UI surfaces the real reason.
 *
 * @param name What to call the new space, in the user's own words.
 * @param plan `free` unless the user asked for a paid organization; a paid
 *   one starts a subscription.
 * @assistant group:spaces
 * @assistant confirm: money. A paid space starts a subscription, and a repeat leaves a second billable space standing.
 */
export async function createOrg(
  scope: HttpScope,
  name: string,
  plan: OrgPlan,
): Promise<CreateOrgOutcome> {
  try {
    const res = await httpRequest(scope, "/v1/orgs", {
      method: "POST",
      body: JSON.stringify({ name, plan }),
    });
    return readCreatedOrg(await res.json());
  } catch (err) {
    const freeOrgSlug = freeOrgTakenSlug(err);
    if (freeOrgSlug) return { kind: FREE_ORG_TAKEN, freeOrgSlug };
    throw err;
  }
}
