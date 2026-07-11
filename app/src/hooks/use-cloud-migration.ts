import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { LegacyDetection } from "../lib/cloud-migration";
import { DEMO_DETECTION, isMigrationDemo } from "../lib/cloud-migration-demo";
import { isHostedGatewayEngine } from "../lib/engine";
import { reportError } from "../lib/error-toast";
import { readMigrated } from "../lib/migration-status";
import { osDetectLegacyHouston, osIsTauri } from "../lib/os-bridge";
import { queryKeys } from "../lib/query-keys";
import {
  type CloudMigrationGateState,
  type CloudMigrationOutcome,
  cloudMigrationGateState,
} from "./cloud-migration-trigger";
import { useSession } from "./use-session";

const STORAGE_PREFIX = "houston.cloudMigration.";

/** The legacy data is machine-local, so the outcome flag is too: localStorage,
 *  keyed per signed-in user (a shared machine migrates once per account). */
function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readOutcome(userId: string): CloudMigrationOutcome | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw === "done" || raw === "skipped" ? raw : null;
  } catch (e) {
    reportError("cloud_migration_storage", "reading the outcome failed", e);
    return null;
  }
}

export interface CloudMigrationTrigger {
  /** `show` renders the wizard, `loading` a splash, `pass` the app. */
  status: CloudMigrationGateState;
  /** What `detect_legacy_houston` found (for the offer copy). */
  detection: LegacyDetection | null;
  /**
   * Persist the outcome. `applyNow: false` writes the flag (a relaunch skips
   * the wizard) WITHOUT flipping the in-session gate — the done screen stamps
   * itself this way so it isn't ripped out from under the user; its final
   * button re-calls with `applyNow: true`.
   */
  persistOutcome: (
    outcome: CloudMigrationOutcome,
    opts?: { applyNow?: boolean },
  ) => void;
}

/**
 * Gathers the signals for the first-run cloud-migration wizard (HOU-719) and
 * delegates the decision to the pure `cloudMigrationGateState`. Gates: remote
 * gateway build (hosted-oauth / hosted-static), Tauri shell, signed-in
 * identity, legacy data on disk, no persisted outcome.
 */
export function useCloudMigration(): CloudMigrationTrigger {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  // The authoritative gate: only an explicit `migrated:false` is ever a wizard
  // candidate (`true` = done, absent = brand-new user → onboarding).
  const migrated = readMigrated(session);
  const remoteGateway = isHostedGatewayEngine();
  const isTauri = osIsTauri();

  const [outcome, setOutcome] = useState<CloudMigrationOutcome | null>(() =>
    userId ? readOutcome(userId) : null,
  );

  const gatesOpen =
    remoteGateway &&
    isTauri &&
    Boolean(userId) &&
    !outcome &&
    migrated === false;
  const detectQuery = useQuery({
    queryKey: queryKeys.cloudMigrationDetect(),
    // Read-only filesystem scan; stable for the app's lifetime. An automatic
    // probe, not a user action: a failure means "can't detect", so the gate
    // fails CLOSED into the normal app — but it reaches Sentry, never vanishes.
    queryFn: async () => {
      try {
        return await osDetectLegacyHouston();
      } catch (e) {
        reportError(
          "cloud_migration_detect",
          e instanceof Error ? e.message : String(e),
          e,
        );
        throw e;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    enabled: gatesOpen,
    retry: false,
  });

  const persistOutcome = useCallback(
    (value: CloudMigrationOutcome, opts?: { applyNow?: boolean }) => {
      if (userId) {
        try {
          localStorage.setItem(storageKey(userId), value);
        } catch (e) {
          // Worst case the wizard offers again next launch; still report it.
          reportError(
            "cloud_migration_storage",
            "writing the outcome failed",
            e,
          );
        }
      }
      if (opts?.applyNow !== false) setOutcome(value);
    },
    [userId],
  );

  // Dev-only: force the wizard open with stub data so it can be tested in
  // `pnpm dev` (no gateway, no source host). Dead-stripped from prod builds.
  // Placed after every hook so hook order stays stable.
  if (isMigrationDemo()) {
    return {
      status: outcome ? "pass" : "show",
      detection: DEMO_DETECTION,
      persistOutcome,
    };
  }

  const status = cloudMigrationGateState({
    remoteGateway,
    isTauri,
    signedIn: Boolean(userId),
    hasLegacyWorkspaces: detectQuery.data?.hasWorkspaces ?? false,
    outcome,
    migrated,
    loading: gatesOpen && detectQuery.isLoading,
  });

  return { status, detection: detectQuery.data ?? null, persistOutcome };
}
