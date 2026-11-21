import type { BillingInterval } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { checkoutIntervalField } from "../billing/seat-price";
import { optionalInterval } from "../billing/types";
import { moduleScope, SdkHttpError } from "../http";
import { field, requireString } from "../payload";
import { createOrg } from "./create-org";
import {
  acceptOrgInvite,
  declineOrgInvite,
  deleteOrg,
  getMoveStatus,
  listOrgs,
  moveAgent,
} from "./http";
import {
  type AgentMoveStart,
  type AgentMoveStatus,
  type CreateOrgOutcome,
  type OrgPlan,
  type OrgSummary,
  type OrgsList,
  SpacesCommand,
} from "./types";

export type {
  AgentMoveStart,
  AgentMoveStatus,
  BillingSummary,
  CreateOrgOutcome,
  FreeOrg,
  OrgBilling,
  OrgInviteSummary,
  OrgPlan,
  OrgSummary,
  OrgsList,
  SpacesCommandType,
} from "./types";
export { SpacesCommand } from "./types";

export interface SpacesModule {
  listOrgs(): Promise<OrgsList>;
  createOrg(input: {
    name: string;
    plan?: OrgPlan;
    interval?: BillingInterval;
  }): Promise<CreateOrgOutcome>;
  deleteOrg(slug: string): Promise<void>;
  acceptOrgInvite(inviteId: string): Promise<OrgSummary>;
  declineOrgInvite(inviteId: string): Promise<void>;
  moveAgent(agentSlugOrId: string, toSlug: string): Promise<AgentMoveStart>;
  getMoveStatus(
    agentSlugOrId: string,
    moveId: string,
  ): Promise<AgentMoveStatus>;
}

export class SpacesHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "SpacesHttpError");
  }
}

export function createSpacesModule(ctx: ModuleContext): SpacesModule {
  const scope = moduleScope(ctx, "spaces", SpacesHttpError);

  const module: SpacesModule = {
    listOrgs: () => listOrgs(scope),
    createOrg: ({ name, plan = "free", interval }) =>
      createOrg(
        scope,
        name,
        plan,
        plan === "paid" ? checkoutIntervalField(interval) : undefined,
      ),
    deleteOrg: (slug) => deleteOrg(scope, slug),
    acceptOrgInvite: (inviteId) => acceptOrgInvite(scope, inviteId),
    declineOrgInvite: (inviteId) => declineOrgInvite(scope, inviteId),
    moveAgent: (agentSlugOrId, toSlug) =>
      moveAgent(scope, agentSlugOrId, toSlug),
    getMoveStatus: (agentSlugOrId, moveId) =>
      getMoveStatus(scope, agentSlugOrId, moveId),
  };

  ctx.registerCommand(SpacesCommand.List, () => module.listOrgs());
  ctx.registerCommand(SpacesCommand.Create, (p) =>
    module.createOrg({
      name: requireString(p, "name"),
      plan: field(p, "plan") === "paid" ? "paid" : "free",
      interval: optionalInterval(p),
    }),
  );
  ctx.registerCommand(SpacesCommand.Delete, (p) =>
    module.deleteOrg(requireString(p, "slug")),
  );
  ctx.registerCommand(SpacesCommand.AcceptInvite, (p) =>
    module.acceptOrgInvite(requireString(p, "inviteId")),
  );
  ctx.registerCommand(SpacesCommand.DeclineInvite, (p) =>
    module.declineOrgInvite(requireString(p, "inviteId")),
  );
  ctx.registerCommand(SpacesCommand.MoveAgent, (p) =>
    module.moveAgent(requireString(p, "agentSlugOrId"), requireString(p, "to")),
  );
  ctx.registerCommand(SpacesCommand.MoveStatus, (p) =>
    module.getMoveStatus(
      requireString(p, "agentSlugOrId"),
      requireString(p, "moveId"),
    ),
  );

  return module;
}
