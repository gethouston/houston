import { agentNameKey } from "@houston/sdk/agent-name";
import type { CreateAgent } from "@houston/wire-types";
import type { MigrationTask, SourceAgent } from "./cloud-migration";

const MIGRATED_AGENT_CONFIG_ID = "personal-assistant";

export function migratedAgentCreate(task: MigrationTask): CreateAgent {
  return {
    name: task.targetName,
    configId: MIGRATED_AGENT_CONFIG_ID,
    color: task.color,
    migration: true,
  };
}

export interface ExistingCloudAgent {
  name: string;
  importedSource?: { workspace: string; agent: string } | null;
}

export function buildMigrationPlan(
  sourceAgents: SourceAgent[],
  existing: ExistingCloudAgent[],
): MigrationTask[] {
  const taken = new Set(existing.map((a) => agentNameKey(a.name)));
  const tasks: MigrationTask[] = [];
  for (const src of sourceAgents) {
    const done = existing.find(
      (a) =>
        a.importedSource &&
        a.importedSource.workspace === src.workspaceId &&
        a.importedSource.agent === src.name,
    );
    if (done) {
      tasks.push({
        sourceId: src.id,
        workspace: src.workspaceId,
        agent: src.name,
        targetName: done.name,
        alreadyDone: true,
        manifest: src.manifest,
        color: src.color,
      });
      continue;
    }
    let targetName = src.name;
    if (taken.has(agentNameKey(targetName))) {
      const base = `${src.name} (${src.workspaceId})`;
      targetName = base;
      for (let n = 2; taken.has(agentNameKey(targetName)); n++) {
        targetName = `${base} ${n}`;
      }
    }
    taken.add(agentNameKey(targetName));
    tasks.push({
      sourceId: src.id,
      workspace: src.workspaceId,
      agent: src.name,
      targetName,
      alreadyDone: false,
      manifest: src.manifest,
      color: src.color,
    });
  }
  return tasks;
}

export function isPlausibleMigrationTarget(
  name: string,
  sourceAgents: Pick<SourceAgent, "name">[],
): boolean {
  const n = agentNameKey(name);
  return sourceAgents.some((s) => {
    const base = agentNameKey(s.name);
    return n === base || n.startsWith(`${base} (`);
  });
}
