/**
 * The skills module — everything a skill can be reached by, under one facade.
 *
 * A skill is a procedure an agent follows. Three families share the name and
 * little else, so the facade keeps them apart rather than flattening them:
 * `sdk.skills.agent` is one agent's OWN skills (its `.agents/skills/` plus the
 * manifest saying which of them are switched on), `sdk.skills.shared` the
 * workspace-wide library every agent in a space can draw from, and
 * `sdk.skills.marketplace` installing someone else's.
 *
 * These are pure commands: a skills screen opens them, reads once, and writes
 * from a form. No host event invalidates them and no surface renders them
 * continuously, so there is no reactive scope to publish. The same handlers back
 * both the typed facade and the bridge `dispatch` path.
 *
 * SEAM — per-agent control-plane routes proxied to the agent's pod, reached on
 * the flat {@link agentSkillsScope} rooted at the base URL rather than
 * `clientFor(agentId)`, so the paths stay literal and the assistant's operation
 * catalog can see them. A 401 routes through the shared
 * {@link ModuleContext.authExpiry} notifier.
 */

import type { ModuleContext } from "../../module-context";
import {
  createSkill,
  deleteSkill,
  getSkillsManifest,
  listSkills,
  loadSkill,
  putSkillsManifest,
  saveSkill,
} from "./agent-skills";
import { createMarketplace } from "./marketplace";
import { createSharedSkills } from "./shared-skills";
import {
  AgentSkillsCommand,
  agentSkillsScope,
  type NewSkill,
  requireManifest,
  requireNewSkill,
  requireString,
  type SkillDetail,
  type SkillSummary,
  type SkillsManifest,
} from "./types-agent";
import type { SkillsMarketplace } from "./types-marketplace";
import type { SharedSkillsModule } from "./types-shared";

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

/** One agent's own skills and its manifest. Every call throws on a non-2xx. */
export interface AgentSkillsFacade {
  /** The skills this agent can follow, summaries only. */
  listSkills(agentId: string): Promise<SkillSummary[]>;
  /** One skill's full detail, including its instructions. */
  loadSkill(agentId: string, slug: string): Promise<SkillDetail>;
  /** Add a skill to this agent. No body on success. */
  createSkill(agentId: string, body: NewSkill): Promise<void>;
  /** Overwrite a skill's instructions in place — no earlier copy is kept. */
  saveSkill(agentId: string, slug: string, content: string): Promise<void>;
  /** Remove a skill from this agent. */
  deleteSkill(agentId: string, slug: string): Promise<void>;
  /** Which of this agent's skills are switched on. */
  getSkillsManifest(agentId: string): Promise<SkillsManifest>;
  /** Replace the whole enabled list; echoes what the host stored. */
  putSkillsManifest(
    agentId: string,
    manifest: SkillsManifest,
  ): Promise<SkillsManifest>;
}

/** The typed facade for every skill family. */
export interface SkillsModule {
  /** One agent's own skills (`.agents/skills/`) and its manifest. */
  agent: AgentSkillsFacade;
  /** The workspace-wide library every agent in a space can draw from. */
  shared: SharedSkillsModule;
  /** Community and repository skills, and installing one onto an agent. */
  marketplace: SkillsMarketplace;
}

export function createSkillsModule(ctx: ModuleContext): SkillsModule {
  const { baseUrl, ports } = ctx.config;
  const scope = agentSkillsScope(baseUrl, ports, () =>
    ctx.authExpiry.notifyExpired(),
  );

  const agent: AgentSkillsFacade = {
    listSkills: (agentId) => listSkills(scope, agentId),
    loadSkill: (agentId, slug) => loadSkill(scope, agentId, slug),
    createSkill: (agentId, body) => createSkill(scope, agentId, body),
    saveSkill: (agentId, slug, content) =>
      saveSkill(scope, agentId, slug, content),
    deleteSkill: (agentId, slug) => deleteSkill(scope, agentId, slug),
    getSkillsManifest: (agentId) => getSkillsManifest(scope, agentId),
    putSkillsManifest: (agentId, manifest) =>
      putSkillsManifest(scope, agentId, manifest),
  };

  ctx.registerCommand(AgentSkillsCommand.List, (p) =>
    agent.listSkills(requireString(p, "agentId")),
  );
  ctx.registerCommand(AgentSkillsCommand.Load, (p) =>
    agent.loadSkill(requireString(p, "agentId"), requireString(p, "slug")),
  );
  ctx.registerCommand(AgentSkillsCommand.Create, (p) =>
    agent.createSkill(requireString(p, "agentId"), requireNewSkill(p, "body")),
  );
  ctx.registerCommand(AgentSkillsCommand.Save, (p) =>
    agent.saveSkill(
      requireString(p, "agentId"),
      requireString(p, "slug"),
      requireString(p, "content"),
    ),
  );
  ctx.registerCommand(AgentSkillsCommand.Delete, (p) =>
    agent.deleteSkill(requireString(p, "agentId"), requireString(p, "slug")),
  );
  ctx.registerCommand(AgentSkillsCommand.GetManifest, (p) =>
    agent.getSkillsManifest(requireString(p, "agentId")),
  );
  ctx.registerCommand(AgentSkillsCommand.PutManifest, (p) =>
    agent.putSkillsManifest(
      requireString(p, "agentId"),
      requireManifest(p, "manifest"),
    ),
  );

  return {
    agent,
    shared: createSharedSkills(ctx),
    marketplace: createMarketplace(ctx),
  };
}
