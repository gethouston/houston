import type { ModuleContext } from "../../module-context";
import type { HttpScope } from "../http";
import { requireBoolean, requireString } from "../payload";
import {
  getSkillsManifest,
  putSkillsManifest,
  setSkillEnabled,
} from "./agent-manifest";
import { disableSkillForAgent, revertSkillOverride } from "./agent-overrides";
import {
  createSkill,
  deleteSkill,
  listSkills,
  loadSkill,
  saveSkill,
} from "./agent-skills";
import {
  AgentSkillsCommand,
  type NewSkill,
  requireManifest,
  requireNewSkill,
  type SkillDetail,
  type SkillSummary,
  type SkillsManifest,
} from "./types-agent";

export interface AgentSkillsFacade {
  listSkills(agentId: string): Promise<SkillSummary[]>;
  loadSkill(agentId: string, slug: string): Promise<SkillDetail>;
  createSkill(agentId: string, body: NewSkill): Promise<void>;
  saveSkill(agentId: string, slug: string, content: string): Promise<void>;
  deleteSkill(agentId: string, slug: string): Promise<void>;
  getSkillsManifest(agentId: string): Promise<SkillsManifest>;
  putSkillsManifest(
    agentId: string,
    manifest: SkillsManifest,
  ): Promise<SkillsManifest>;
  setSkillEnabled(
    agentId: string,
    slug: string,
    enabled: boolean,
  ): Promise<SkillsManifest>;
  revertSkillOverride(agentId: string, slug: string): Promise<void>;
  disableSkillForAgent(agentId: string, slug: string): Promise<void>;
}

function perAgentQueue(): <T>(
  agentId: string,
  run: () => Promise<T>,
) => Promise<T> {
  const chains = new Map<string, Promise<unknown>>();
  return <T>(agentId: string, run: () => Promise<T>): Promise<T> => {
    const chain = (chains.get(agentId) ?? Promise.resolve()).then(run);
    chains.set(
      agentId,
      chain.then(
        () => undefined,
        () => undefined,
      ),
    );
    return chain;
  };
}

export function createAgentSkillsFacade(scope: HttpScope): AgentSkillsFacade {
  const serialized = perAgentQueue();
  return {
    listSkills: (agentId) => listSkills(scope, agentId),
    loadSkill: (agentId, slug) => loadSkill(scope, agentId, slug),
    createSkill: (agentId, body) => createSkill(scope, agentId, body),
    saveSkill: (agentId, slug, content) =>
      saveSkill(scope, agentId, slug, content),
    deleteSkill: (agentId, slug) => deleteSkill(scope, agentId, slug),
    getSkillsManifest: (agentId) => getSkillsManifest(scope, agentId),
    putSkillsManifest: (agentId, manifest) =>
      putSkillsManifest(scope, agentId, manifest),
    setSkillEnabled: (agentId, slug, enabled) =>
      serialized(agentId, () => setSkillEnabled(scope, agentId, slug, enabled)),
    revertSkillOverride: (agentId, slug) =>
      serialized(agentId, () => revertSkillOverride(scope, agentId, slug)),
    disableSkillForAgent: (agentId, slug) =>
      serialized(agentId, () => disableSkillForAgent(scope, agentId, slug)),
  };
}

export function registerAgentSkillCommands(
  ctx: ModuleContext,
  agent: AgentSkillsFacade,
): void {
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
  ctx.registerCommand(AgentSkillsCommand.SetEnabled, (p) =>
    agent.setSkillEnabled(
      requireString(p, "agentId"),
      requireString(p, "slug"),
      requireBoolean(p, "enabled"),
    ),
  );
  ctx.registerCommand(AgentSkillsCommand.RevertOverride, (p) =>
    agent.revertSkillOverride(
      requireString(p, "agentId"),
      requireString(p, "slug"),
    ),
  );
  ctx.registerCommand(AgentSkillsCommand.DisableForAgent, (p) =>
    agent.disableSkillForAgent(
      requireString(p, "agentId"),
      requireString(p, "slug"),
    ),
  );
}
