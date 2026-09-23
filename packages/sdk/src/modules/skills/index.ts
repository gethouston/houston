/**
 * The skills module — everything a skill can be reached by, under one facade.
 *
 * A skill is a procedure an agent follows. Two families share the name and
 * little else, so the facade keeps them apart rather than flattening them:
 * `sdk.skills.agent` is one agent's OWN skills (its `.agents/skills/` plus the
 * manifest saying which of them are switched on), and `sdk.skills.shared` the
 * workspace-wide library every agent in a space can draw from.
 *
 * These are pure commands: a skills screen opens them, reads once, and writes
 * from a form. No host event invalidates them and no surface renders them
 * continuously, so there is no reactive scope to publish. The same handlers back
 * both the typed facade and the `dispatch` path.
 *
 * SEAM — per-agent control-plane routes proxied to the agent's pod, reached on
 * the flat {@link agentSkillsScope} rooted at the base URL rather than
 * `clientFor(agentId)`, so the paths stay literal and the assistant's operation
 * catalog can see them. A 401 routes through the shared
 * {@link ModuleContext.authExpiry} notifier.
 */

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

/** The typed facade for every skill family. */
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
  // A creation chat is a conversation on the agent's board, so throwing one
  // away is the board's own archive write.
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
