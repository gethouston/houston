/**
 * The spaces module (C8) — the spaces a caller belongs to, their lifecycle, the
 * invitations addressed to them, and moving an agent between spaces. The
 * subscription behind a team space belongs to the billing family.
 *
 * These are pure commands over hosted-gateway routes: a space list is read when
 * the switcher opens and every write is a form's one-shot, so there is no
 * reactive scope to publish and nothing here subscribes to an event. The same
 * handlers back both the typed facade and the bridge `dispatch` path.
 *
 * SEAM — user-scoped, NOT per-agent. Even the agent-move routes are gateway
 * control routes about WHICH namespace an agent lives in, so they run on the
 * flat {@link spacesScope} rooted at the base URL, never `clientFor(agentId)`.
 * A 401 routes through the shared {@link ModuleContext.authExpiry} notifier.
 */

import type { ModuleContext } from "../../module-context";
import {
  acceptOrgInvite,
  createOrg,
  declineOrgInvite,
  deleteOrg,
  getMoveStatus,
  listOrgs,
  moveAgent,
} from "./http";
import { spacesScope } from "./scope";
import {
  type AgentMoveStart,
  type AgentMoveStatus,
  type OrgSummary,
  type OrgsList,
  requireString,
  SpacesCommand,
} from "./types";

export { SpacesHttpError } from "./scope";
export type {
  AgentMoveStart,
  AgentMoveStatus,
  BillingSummary,
  OrgInviteSummary,
  OrgRole,
  OrgSummary,
  OrgsList,
  SpacesCommandType,
} from "./types";
export { SpacesCommand } from "./types";

/** The typed facade for the spaces family. Every call throws on a non-2xx. */
export interface SpacesModule {
  /** The caller's spaces plus the invitations waiting for them. */
  listOrgs(): Promise<OrgsList>;
  /** Create a team space. NOT idempotent — reconcile with `listOrgs`. */
  createOrg(name: string): Promise<OrgSummary>;
  /** Delete a team space the caller owns, and everything inside it. */
  deleteOrg(slug: string): Promise<void>;
  /** Accept a pending invite; answers the space that was joined. */
  acceptOrgInvite(inviteId: string): Promise<OrgSummary>;
  /** Decline a pending invite addressed to the caller. */
  declineOrgInvite(inviteId: string): Promise<void>;
  /** Start moving an agent into `toSlug`; answers the id to poll. */
  moveAgent(agentSlugOrId: string, toSlug: string): Promise<AgentMoveStart>;
  /** Poll one agent move — the ONLY completion signal for it. */
  getMoveStatus(
    agentSlugOrId: string,
    moveId: string,
  ): Promise<AgentMoveStatus>;
}

export function createSpacesModule(ctx: ModuleContext): SpacesModule {
  const { baseUrl, ports } = ctx.config;
  const scope = spacesScope(baseUrl, ports, () =>
    ctx.authExpiry.notifyExpired(),
  );

  const module: SpacesModule = {
    listOrgs: () => listOrgs(scope),
    createOrg: (name) => createOrg(scope, name),
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
    module.createOrg(requireString(p, "name")),
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
