import type { ModuleContext } from "../../module-context";
import {
  createActivitiesHttp,
  createActivitiesWrites,
} from "../activities/http";
import { moduleScope } from "../http";
import { requireString } from "../payload";
import {
  type AgentSkillsFacade,
  createAgentSkillsFacade,
  registerAgentSkillCommands,
} from "./agent-facade";
import { createSkillDraftWrites, type SkillDraftWrites } from "./drafts-writes";
import { createSharedSkills } from "./shared-skills";
import { AgentSkillsCommand, AgentSkillsHttpError } from "./types-agent";
import type { SharedSkillsModule } from "./types-shared";

export type { AgentSkillsFacade } from "./agent-facade";
export type {
  HostSkillSummary,
  NewSkill,
  SkillDetail,
  SkillInputDef,
  SkillSummary,
  SkillsManifest,
} from "./types-agent";
export {
  AgentSkillsCommand,
  type AgentSkillsCommandType,
  AgentSkillsHttpError,
} from "./types-agent";

export interface SkillsModule extends SkillDraftWrites {
  /** One agent's own skills (`.agents/skills/`) and its manifest. */
  agent: AgentSkillsFacade;
  /** The workspace-wide library every agent in a space can draw from. */
  shared: SharedSkillsModule;
}

export function createSkillsModule(ctx: ModuleContext): SkillsModule {
  const agent = createAgentSkillsFacade(
    moduleScope(ctx, "skills", AgentSkillsHttpError),
  );
  registerAgentSkillCommands(ctx, agent);
  const drafts = createSkillDraftWrites(
    createActivitiesWrites(createActivitiesHttp(ctx)),
  );
  ctx.registerCommand(AgentSkillsCommand.DiscardDraft, (p) =>
    drafts.discardSkillDraft(
      requireString(p, "agentId"),
      requireString(p, "activityId"),
    ),
  );
  return { agent, shared: createSharedSkills(ctx), ...drafts };
}
