/**
 * Wire types + command vocabulary for the spaces module (C8) — the spaces a
 * caller belongs to, the invitations addressed to them, and the receipt of an
 * agent move between spaces.
 *
 * Everything here is plain JSON, so it crosses the bridge's `dispatch` boundary
 * unchanged. There is no reactive scope: a space list is read when the switcher
 * opens and every write is a form's one-shot, so the module is plain-async and
 * publishes nothing (the SDK's preferences shape).
 */

import type { OrgRole } from "@houston/protocol";

/** The write vocabulary — the same handlers back the facade and the bridge. */
export const SpacesCommand = {
  List: "spaces/list",
  Create: "spaces/create",
  Delete: "spaces/delete",
  AcceptInvite: "spaces/acceptInvite",
  DeclineInvite: "spaces/declineInvite",
  MoveAgent: "spaces/moveAgent",
  MoveStatus: "spaces/moveStatus",
} as const;

export type SpacesCommandType =
  (typeof SpacesCommand)[keyof typeof SpacesCommand];

/**
 * Billing status of a team space, attached to an {@link OrgSummary} only for
 * teams and only for owner/admin callers. The DERIVED effective `status` (never
 * a stored column) drives every UI billing state, and `seats` is the live member
 * count at read time. The gateway is the source of truth.
 */
export interface BillingSummary {
  plan: "team" | "enterprise";
  status: "free" | "trialing" | "active" | "past_due" | "expired";
  /** ISO-8601; present once the trial clock exists. */
  trialEndsAt?: string;
  seats: number;
  /** Present once subscribed. */
  interval?: "monthly" | "annual";
}

/**
 * One space the caller belongs to. `role` is the caller's role IN THIS space
 * and `degraded` is `true` when writes would `403 needs_upgrade` (every member
 * sees it; it carries no billing detail).
 *
 * The `slug` is what pins the active space: a team's switcher workspace id is
 * `"org:" + slug`, and that slug rides `x-houston-org` / `?org=`.
 */
export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  role: OrgRole;
  memberCount: number;
  degraded: boolean;
  billing?: BillingSummary;
}

/**
 * A pending invite addressed to the caller's email, from `GET /v1/orgs`
 * (`invites`). Accepted via `POST /v1/org-invites/:id/accept`, declined via
 * `DELETE /v1/org-invites/:id`.
 */
export interface OrgInviteSummary {
  id: string;
  orgName: string;
  role: OrgRole;
  invitedBy?: string;
}

/**
 * Answer of `GET /v1/orgs`: every membership plus every pending invite
 * addressed to the caller.
 */
export interface OrgsList {
  orgs: OrgSummary[];
  invites: OrgInviteSummary[];
}

/**
 * Answer of `POST /v1/agents/:slug/move`: the id to poll for move progress. The
 * route is async — `202 {moveId}` — because a move stops and restarts the
 * agent's pod; completion is read from `GET /v1/agents/:slug/move/:moveId`,
 * NEVER inferred from the agent event stream (which only relays pod-scoped
 * events).
 */
export interface AgentMoveStart {
  moveId: string;
}

/**
 * Progress of one agent move. `done`/`failed` are terminal; `error` is a
 * human-readable reason present on `failed`. The share pipeline MUST poll this
 * to terminal `done` before inviting — inviting mid-move is forbidden by the
 * client contract.
 */
export interface AgentMoveStatus {
  status: "moving" | "done" | "failed";
  error?: string;
}
