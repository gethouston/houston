import type { CloudMigrationOutcome } from "../hooks/cloud-migration-trigger";

export const CLOUD_MIGRATION_OUTCOME_KEY = "houston.cloudMigration.outcome";

const LEGACY_PER_USER_PREFIX = "houston.cloudMigration.";

export interface OutcomeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function parse(raw: string | null): CloudMigrationOutcome | null {
  return raw === "done" || raw === "skipped" ? raw : null;
}

export function readCloudMigrationOutcome(
  storage: OutcomeStorage,
  userId: string | null,
): CloudMigrationOutcome | null {
  const outcome = parse(storage.getItem(CLOUD_MIGRATION_OUTCOME_KEY));
  if (outcome || !userId) return outcome;
  const legacyKey = LEGACY_PER_USER_PREFIX + userId;
  const legacy = parse(storage.getItem(legacyKey));
  if (legacy) {
    storage.setItem(CLOUD_MIGRATION_OUTCOME_KEY, legacy);
    storage.removeItem(legacyKey);
  }
  return legacy;
}

export function writeCloudMigrationOutcome(
  storage: OutcomeStorage,
  outcome: CloudMigrationOutcome,
): void {
  storage.setItem(CLOUD_MIGRATION_OUTCOME_KEY, outcome);
}

export function clearCloudMigrationOutcome(
  storage: OutcomeStorage,
  userId: string | null,
): void {
  storage.removeItem(CLOUD_MIGRATION_OUTCOME_KEY);
  if (userId) storage.removeItem(LEGACY_PER_USER_PREFIX + userId);
}
