/**
 * The C8 Billing gates: who may SEE what a team space costs.
 *
 * Split out of `org-roles.ts` (which stayed the caller's ROLE logic) because
 * billing is the one surface there that asks a second question beyond the role
 * — whether the ACTIVE space bills at all — and because that file had grown
 * past the size limit. Same contract as its siblings: cosmetic gates only, the
 * gateway is the sole enforcer, and these merely hide affordances the caller
 * could not act on. Unit-tested in `app/tests/org-roles.test.ts`.
 */

import type { Capabilities } from "@houston-ai/engine-client";
import { hasSpaces, orgRole } from "./org-roles.ts";

/**
 * Can this caller SEE the team's billing detail (C8 §Billing wire surface)?
 * Owner/admin only — the gateway 403s a plain member's `GET /v1/org/billing`.
 * Members NEVER see billing data; they render the `OrgSummary.degraded` banner
 * and "ask your owner" copy instead. The admin/owner asymmetry lives elsewhere:
 * an admin sees the summary (this gate) but cannot checkout (owner-only write) —
 * the client shows admins the same "ask the owner to upgrade" copy, just better
 * informed. Single-player has no billing, so `null` role is denied here (unlike
 * `canCreateAgents`, which grants the sole user everything).
 */
export function canSeeBilling(caps: Capabilities | null | undefined): boolean {
  const role = orgRole(caps);
  return role === "owner" || role === "admin";
}

/**
 * Whether the C8 Billing surface (the org dashboard tab AND the `useBilling`
 * query) belongs at all: only on a Spaces-capable host (`caps.spaces`), only
 * when the ACTIVE space is a team (personal spaces are free forever and never
 * bill), and only for owner/admin (`canSeeBilling`; members never see billing
 * data — C8 §Client UX). One source of truth for both the tab-visibility gate
 * and the query-fire gate so they can never drift.
 */
export function canSeeBillingTab(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  return hasSpaces(caps) && activeSpaceIsTeam && canSeeBilling(caps);
}
