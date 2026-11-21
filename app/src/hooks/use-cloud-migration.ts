import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { LegacyDetection } from "../lib/cloud-migration";
import { DEMO_DETECTION, isMigrationDemo } from "../lib/cloud-migration-demo";
import {
  readCloudMigrationOutcome,
  writeCloudMigrationOutcome,
} from "../lib/cloud-migration-outcome";
import { isHostedGatewayEngine } from "../lib/engine";
import { reportError } from "../lib/error-report";
import { osDetectLegacyHouston, osIsTauri } from "../lib/os-bridge";
import { queryKeys } from "../lib/query-keys";
import {
  type CloudMigrationGateState,
  type CloudMigrationOutcome,
  cloudMigrationGateState,
} from "./cloud-migration-trigger";
import { useOnboardingCompleted } from "./use-onboarding-completed";
import { useSession } from "./use-session";

function readOutcome(userId: string | null): CloudMigrationOutcome | null {
  try {
    return readCloudMigrationOutcome(localStorage, userId);
  } catch (e) {
    reportError("cloud_migration_storage", "reading the outcome failed", e);
    return null;
  }
}

export interface CloudMigrationTrigger {
  status: CloudMigrationGateState;
  detection: LegacyDetection | null;
  persistOutcome: (
    outcome: CloudMigrationOutcome,
    opts?: { applyNow?: boolean },
  ) => void;
}

export function useCloudMigration(): CloudMigrationTrigger {
  const { data: session } = useSession();
  const userId = session?.uid ?? null;
  const remoteGateway = isHostedGatewayEngine();
  const isTauri = osIsTauri();
  const { markCompleted } = useOnboardingCompleted();

  const [outcome, setOutcome] = useState<CloudMigrationOutcome | null>(() =>
    readOutcome(userId),
  );

  const gatesOpen = remoteGateway && isTauri && Boolean(userId) && !outcome;
  const detectQuery = useQuery({
    queryKey: queryKeys.cloudMigrationDetect(),
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
      try {
        writeCloudMigrationOutcome(localStorage, value);
      } catch (e) {
        reportError("cloud_migration_storage", "writing the outcome failed", e);
      }
      if (value === "done") void markCompleted();
      if (opts?.applyNow !== false) setOutcome(value);
    },
    [markCompleted],
  );

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
    loading: gatesOpen && detectQuery.isLoading,
  });

  return { status, detection: detectQuery.data ?? null, persistOutcome };
}
