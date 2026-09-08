import type {
  AgentMoveStart,
  AgentMoveStatus,
  OrgSummary,
  OrgsList,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Spaces (C8): the caller's personal + team spaces, their lifecycle, the invites
 * addressed to them, and moving an agent between spaces. The subscription behind
 * a team space lives in `billing.ts`.
 */

/**
 * Lists the spaces the user belongs to and any invitations waiting for them.
 *
 * The caller's spaces + pending invites. Degrades to an empty result on a
 * gateway that predates spaces (404) — the switcher then shows only the personal
 * workspace, byte-identical to a pre-C8 deployment. Every other error throws.
 * @assistant group:spaces
 */
export async function listOrgs(cfg: ControlPlaneConfig): Promise<OrgsList> {
  try {
    const res = await cpFetch(cfg, "/v1/orgs");
    return (await res.json()) as OrgsList;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) {
      return { orgs: [], invites: [] };
    }
    throw err;
  }
}

/**
 * Creates a shared space the user can invite teammates into.
 *
 * Create a team space. NOT idempotent — on a lost response DON'T blind-retry;
 * reconcile via `listOrgs` and reuse the persisted slug (C8). Never degrades: a
 * failure throws so the UI surfaces the real reason.
 *
 * Confirmed: money. A space carries its own subscription, and the call is not
 * idempotent, so a repeat leaves a second billable space standing.
 * @param name What to call the new space, in the user's own words.
 * @assistant group:spaces confirm
 */
export async function createOrg(
  cfg: ControlPlaneConfig,
  name: string,
): Promise<OrgSummary> {
  const res = await cpFetch(cfg, "/v1/orgs", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as OrgSummary;
}

/**
 * Deletes a shared space the user owns, along with everything inside it.
 *
 * Delete a team space the caller owns (`DELETE /v1/orgs/:slug`, PRODUCT-1410).
 * Never degrades: every rejection is a state the owner must see — `404
 * org_not_found` (already gone, or not theirs), `403 personal_space` (a
 * personal space is never deletable), `403` plain not-allowed (not the owner),
 * `409 has_members` (teammates remain — remove them first), `409
 * subscription_active` (a live subscription — cancel it first). A `204` means
 * the space and everything in it is gone for good; the caller must re-list.
 *
 * Confirmed: irreversible. A delete takes the space and everything in it for
 * good.
 * @param slug The space to delete, by the slug listOrgs returns.
 * @assistant group:spaces confirm hidden: destroys a shared space and everything inside it for good; that decision stays with the person, and the hosted gateway denies the route to this surface anyway.
 */
export async function deleteOrg(
  cfg: ControlPlaneConfig,
  slug: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/orgs/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

/**
 * Accepts an invitation to join a shared space.
 *
 * Accept a pending invite addressed to the caller (C8), by the id that rides
 * `listOrgs().invites`. Answers the joined space (the gateway wraps it as
 * `{org}`) so the caller can name it without a second read. Never degrades —
 * every rejection is a state the invitee must see: `404 invite_not_found`
 * (revoked, already used, or addressed to another email — the gateway
 * deliberately can't tell those apart), `409 already_member`, `403
 * needs_upgrade` (the team's trial ended).
 * @param inviteId The invitation to accept, by the id listOrgs returns with
 *   the pending invitations.
 * @assistant group:spaces confirm
 */
export async function acceptOrgInvite(
  cfg: ControlPlaneConfig,
  inviteId: string,
): Promise<OrgSummary> {
  const res = await cpFetch(
    cfg,
    `/v1/org-invites/${encodeURIComponent(inviteId)}/accept`,
    { method: "POST" },
  );
  return ((await res.json()) as { org: OrgSummary }).org;
}

/**
 * Declines an invitation to join a shared space.
 *
 * Decline a pending invite addressed to the caller (C8) — the invitee's own
 * `204`, NOT the owner's revoke (`deleteOrgInvite`, org-scoped at
 * `/v1/org/invites/:id`). Never degrades: a `404 invite_not_found` must reach
 * the UI so the stale row explains itself.
 * @param inviteId The invitation to decline, by the id listOrgs returns
 *   with the pending invitations.
 * @assistant group:spaces confirm
 */
export async function declineOrgInvite(
  cfg: ControlPlaneConfig,
  inviteId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org-invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
  });
}

/**
 * Moves an agent into a shared space so teammates can work with it.
 *
 * Move an agent into a team space; returns the `moveId` to poll with
 * `getMoveStatus`. Never degrades — 403 `unsupported_move` / 409
 * `unmovable_volume` / 403 `needs_upgrade` throw so the caller surfaces them.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param toSlug The space to move it into, by the slug listOrgs returns.
 * @assistant group:spaces confirm
 */
export async function moveAgent(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  toSlug: string,
): Promise<AgentMoveStart> {
  const res = await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/move`,
    { method: "POST", body: JSON.stringify({ to: toSlug }) },
  );
  return (await res.json()) as AgentMoveStart;
}

/**
 * Checks how an agent's move to another space is going.
 *
 * Poll one agent-move's progress (C8). The move-completion signal is THIS route
 * only — never the agent event stream (which relays pod-scoped events).
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param moveId The move to check on, by the id moveAgent answered with.
 * @assistant group:spaces
 */
export async function getMoveStatus(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  moveId: string,
): Promise<AgentMoveStatus> {
  const res = await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/move/${encodeURIComponent(moveId)}`,
  );
  return (await res.json()) as AgentMoveStatus;
}
