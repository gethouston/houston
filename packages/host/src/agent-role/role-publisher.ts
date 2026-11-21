import type { DocPublisher } from "../docs/doc-publisher";
import { AGENT_ROLE_FAMILY } from "../docs/http-shadow";
import type { DocShadowProjector } from "../docs/projector";
import {
  type AgentRoleTracker,
  RolePublishDeferredError,
} from "./role-tracker";

export interface AgentRoleDoc {
  role?: string;
}

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
