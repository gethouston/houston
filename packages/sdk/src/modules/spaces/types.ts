/**
 * Wire types + command vocabulary for the spaces module (C8) — the spaces a
 * caller belongs to, the invitations addressed to them, and the receipt of an
 * agent move between spaces.
 *
 * Everything here is plain JSON, so it crosses the `dispatch` boundary
 * unchanged. There is no reactive scope: a space list is read when the switcher
 * opens and every write is a form's one-shot, so the module is plain-async and
 * publishes nothing (the SDK's preferences shape).
 */

/** The write vocabulary — the same handlers back the facade and `dispatch`. */
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
 * The space wire shapes are the protocol's own (`@houston/wire-types`), so the
 * shape a space carries and the shape every surface reads can never drift
 * apart. `BillingSummary` is the C8 team summary `GET /v1/org/billing` still
 * answers; an org's billing state rides `OrgSummary.billing`.
 */
export type {
  BillingSummary,
  CreateOrgOutcome,
  FreeOrg,
  OrgBilling,
  OrgInviteSummary,
  OrgPlan,
  OrgSummary,
  OrgsList,
} from "@houston/wire-types";

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
