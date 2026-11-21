import {
  collectIntegrations,
  type MigrationTask,
  type SourceAgent,
} from "./cloud-migration";
import {
  buildMigrationPlan,
  type ExistingCloudAgent,
  isPlausibleMigrationTarget,
} from "./cloud-migration-plan";
import {
  agentMigrationStatus,
  fetchSourceScan,
  type SourceHostHandshake,
} from "./cloud-migration-transport";
import { readLegacyAgentColors } from "./legacy-agent-colors";
import { osStartMigrationSourceHost } from "./os-bridge";

export interface PreparedMigration {
  source: SourceHostHandshake;
  tasks: MigrationTask[];
  integrations: string[];
}

async function probeExistingAgents(
  existing: Array<{ id: string; name: string }>,
  sourceAgents: SourceAgent[],
): Promise<ExistingCloudAgent[]> {
  return Promise.all(
    existing.map(async (a): Promise<ExistingCloudAgent> => {
      if (!isPlausibleMigrationTarget(a.name, sourceAgents)) {
        return { name: a.name };
      }
      const marker = await agentMigrationStatus(a.id);
      return { name: a.name, importedSource: marker?.source ?? null };
    }),
  );
}

export async function prepareMigration(
  existingAgents: Array<{ id: string; name: string }>,
): Promise<PreparedMigration> {
  const source = await osStartMigrationSourceHost();
  const scan = await fetchSourceScan(source);
  const colors = readLegacyAgentColors();
  const agents: SourceAgent[] = scan.agents.map((a) => ({
    ...a,
    color: a.color ?? colors.colorFor(a.id, a.name),
  }));
  const existing = await probeExistingAgents(existingAgents, agents);
  return {
    source,
    tasks: buildMigrationPlan(agents, existing),
    integrations: collectIntegrations(agents, scan.accountIntegrations),
  };
}
