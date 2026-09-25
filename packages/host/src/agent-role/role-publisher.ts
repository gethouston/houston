import type { DocPublisher } from "../docs/doc-publisher";
import { AGENT_ROLE_FAMILY } from "../docs/http-shadow";
import type { DocShadowProjector } from "../docs/projector";
import {
  type AgentRoleTracker,
  RolePublishDeferredError,
} from "./role-tracker";

/** The role document the gateway lists an agent's role from. */
export interface AgentRoleDoc {
  role?: string;
}

/**
 * A gateway-fronted pod's role publish: the role document, PUT to the managed
 * doc store the gateway's `GET /agents` reads in one query, so listing the
 * roster never reaches (or wakes) an agent's pod.
 *
 * The doc route names ONE agent, so a role read for any other id (a rename
 * leftover beside the live agent) is refused, the same cross-post rule the
 * family projector and the view sink draw. An agent not bound YET, or a role
 * the gateway did not store, throws, so the tracker leaves it unrecorded and
 * announces nothing until a retry lands it. A gateway that cannot hold role
 * documents at all (deploy skew) is not retried: the listing reads none.
 */
export function createRolePublisher(
  docShadow: DocPublisher,
  docProjector: DocShadowProjector,
): (agentId: string, role: string | undefined) => Promise<void> {
  return async (agentId, role) => {
    const bound = await docProjector.boundAgent();
    if (bound === undefined) {
      throw new RolePublishDeferredError(agentId, "doc route not bound yet");
    }
    if (bound !== agentId) {
      console.warn(
        `[agent-role] refusing role publish for ${agentId} (route bound to ${bound})`,
      );
      return;
    }
    const doc: AgentRoleDoc = role ? { role } : {};
    const result = await docShadow.publish(AGENT_ROLE_FAMILY, doc);
    if (result === "deferred") {
      throw new RolePublishDeferredError(agentId, "gateway did not store it");
    }
  };
}

/**
 * Boot backfill: once the doc route binds at boot seed, read and publish its
 * agent's role. A route that binds later binds on the gateway's first
 * addressed request, which tracks the agent the same way (`host-server.ts`).
 */
export function trackBoundAgentRole(
  tracker: AgentRoleTracker,
  docProjector: DocShadowProjector,
): void {
  void docProjector
    .boundAgent()
    .then((agentId) => {
      if (agentId !== undefined) tracker.ensureTracked(agentId);
    })
    .catch((error: unknown) => {
      console.error("[agent-role] boot role backfill failed", error);
    });
}
