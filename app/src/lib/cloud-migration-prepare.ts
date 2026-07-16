/**
 * The wizard's prepare phase (HOU-719): spawn the passive source host against
 * the old `~/.houston` tree, scan its agents, probe the plausible existing
 * cloud agents for import markers (resume), and build the migration plan.
 *
 * Takes the existing cloud agents as an argument (no store import) so the
 * zustand driver stays thin and this stays independently exercisable.
 */

import {
  buildMigrationPlan,
  collectIntegrations,
  type ExistingCloudAgent,
  isPlausibleMigrationTarget,
  type MigrationTask,
  type SourceAgent,
} from "./cloud-migration";
import {
  agentMigrationStatus,
  fetchSourceScan,
  type SourceHostHandshake,
} from "./cloud-migration-transport";
import { osStartMigrationSourceHost } from "./os-bridge";

export interface PreparedMigration {
  source: SourceHostHandshake;
  tasks: MigrationTask[];
  /** Toolkit slugs the legacy agents had connected (done-screen checklist). */
  integrations: string[];
}

/**
 * Resume probes are bounded to agents that could plausibly be a previous
 * run's output — probing an unrelated sleeping agent would hold the plan on
 * its pod wake-up (the gateway parks per-agent requests, HOU-693).
 */
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

/**
 * Spawn the source host (can block for MINUTES while the old chat db converts
 * — the caller shows a "preparing" state) and plan the run. Throws on any
 * failure; the store parks it in a retryable `startError`.
 */
export async function prepareMigration(
  existingAgents: Array<{ id: string; name: string }>,
): Promise<PreparedMigration> {
  const source = await osStartMigrationSourceHost();
  const scan = await fetchSourceScan(source);
  const existing = await probeExistingAgents(existingAgents, scan.agents);
  return {
    source,
    tasks: buildMigrationPlan(scan.agents, existing),
    // Per-agent records (ancient installs) ∪ the account-level Composio
    // list (the v0.4.x consumer account) — one deduped, sorted checklist.
    integrations: collectIntegrations(scan.agents, scan.accountIntegrations),
  };
}
