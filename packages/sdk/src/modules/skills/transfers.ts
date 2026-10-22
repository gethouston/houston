import { slugify } from "@houston/domain";
import type { ModuleContext } from "../../module-context";
import { listAgents } from "../agents/http";
import type { HttpScope } from "../http";
import { requireString } from "../payload";
import type { AgentSkillsFacade } from "./agent-facade";
import { keepSharedSkillForAgent } from "./keep-for-agent";
import { shareNewSkillToWorkspace } from "./share-new";
import {
  type SkillShareHooks,
  type SkillShareResult,
  SkillTransferCommand,
} from "./transfer-types";
import type { SharedSkillsModule } from "./types-shared";
import { workspaceSkillAgents } from "./workspace-agents";

export function createSkillTransfers(
  ctx: ModuleContext,
  scope: HttpScope,
  agent: AgentSkillsFacade,
  shared: SharedSkillsModule,
) {
  const inFlight = new Set<string>();
  const shareNew = (
    workspaceId: string,
    agentId: string,
    slug: string,
    hooks?: SkillShareHooks,
  ): Promise<SkillShareResult> => {
    const key = JSON.stringify([workspaceId, slug]);
    if (inFlight.has(key)) return Promise.resolve({ outcome: "skipped" });
    inFlight.add(key);
    return shareNewSkillToWorkspace(
      agent,
      shared,
      workspaceId,
      agentId,
      slug,
      hooks,
    ).finally(() => inFlight.delete(key));
  };
  const keep = (workspaceId: string, agentId: string, slug: string) =>
    keepSharedSkillForAgent(
      agent,
      shared,
      () => workspaceSkillAgents(scope, workspaceId),
      workspaceId,
      agentId,
      slug,
    );
  ctx.registerCommand(SkillTransferCommand.ShareNew, (p) =>
    shareNew(
      requireString(p, "workspaceId"),
      requireString(p, "agentId"),
      requireString(p, "slug"),
    ),
  );
  ctx.registerCommand(SkillTransferCommand.KeepForAgent, (p) =>
    keep(
      requireString(p, "workspaceId"),
      requireString(p, "agentId"),
      requireString(p, "slug"),
    ),
  );
  return {
    shareNewSkillToWorkspace: shareNew,
    keepSharedSkillForAgent: keep,
    /** The default also applies to callers creating through the SDK. */
    createSkill: async (
      agentId: string,
      body: Parameters<AgentSkillsFacade["createSkill"]>[1],
    ) => {
      const activeWorkspaceId = ctx.config.ports.activeWorkspaceId?.();
      await agent.createSkill(agentId, body);
      const employee = (await listAgents(scope)).find((a) => a.id === agentId);
      if (!employee)
        throw new Error(
          "created skill's employee is absent from the workspace roster",
        );
      await shareNew(
        activeWorkspaceId ?? employee.workspaceId,
        agentId,
        slugify(body.name),
      );
    },
  };
}
