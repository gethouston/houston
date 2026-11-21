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

export interface AgentMoveStart {
  moveId: string;
}

export interface AgentMoveStatus {
  status: "moving" | "done" | "failed";
  error?: string;
}
