/**
 * One agent's own skills, as a caller reaches them: the typed facade over the
 * module's request functions, the per-agent serialization the manifest writes
 * ride, and the bridge commands that dispatch onto the very same object.
 *
 * Every manifest write is a read of the whole enabled list then a write of it
 * back, so two of them started together would both read the list before either
 * wrote it and the second would drop the first. One chain per agent makes them
 * queue. The chain the next call joins is the SETTLED one, so a rejection is
 * carried to its own caller without stalling the queue, and the map holds one
 * entry per agent the session touched.
 */

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
  /**
   * Switch ONE skill on or off, leaving the rest of the manifest as it is.
   * Calls for the same agent run one after another, so two switches started
   * together both land instead of the second dropping the first.
   */
  setSkillEnabled(
    agentId: string,
    slug: string,
    enabled: boolean,
  ): Promise<SkillsManifest>;
  /**
   * Put this agent back on the workspace's version of a skill: switch the
   * manifest entry on, then drop the agent's own copy that was shadowing it.
   */
  revertSkillOverride(agentId: string, slug: string): Promise<void>;
  /**
   * Stop this agent loading a workspace skill: switch the manifest entry off,
   * then drop the agent's own copy of it, which would otherwise keep loading.
   */
  disableSkillForAgent(agentId: string, slug: string): Promise<void>;
}

/** Queue every manifest write per agent; see this module's header. */
function perAgentQueue(): <T>(
  agentId: string,
  run: () => Promise<T>,
) => Promise<T> {
  const chains = new Map<string, Promise<unknown>>();
  return <T>(agentId: string, run: () => Promise<T>): Promise<T> => {
    // The stored chain is the settled one, which is what carries the queue
    // past a rejection: what the caller waits on may reject, what the next
    // call queues behind never does.
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

/** The bridge vocabulary, dispatched onto the facade the typed callers hold. */
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
