import { Button } from "@houston-ai/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "../../../hooks/use-session";
import {
  clearCloudMigrationOutcome,
  readCloudMigrationOutcome,
} from "../../../lib/cloud-migration-outcome";
import { isHostedGatewayEngine } from "../../../lib/engine";
import { reportError } from "../../../lib/error-report";
import { osDetectLegacyHouston, osIsTauri } from "../../../lib/os-bridge";
import { queryKeys } from "../../../lib/query-keys";

function readOutcome(userId: string | null): "done" | "skipped" | null {
  try {
    return readCloudMigrationOutcome(localStorage, userId);
  } catch (e) {
    reportError("cloud_migration_storage", "reading the outcome failed", e);
    return null;
  }
}

export function useMigrationAvailable(): boolean {
  const { data: session } = useSession();
  const userId = session?.uid ?? null;
  const gates =
    isHostedGatewayEngine() && osIsTauri() && readOutcome(userId) !== "done";
  const detect = useQuery({
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
    enabled: gates,
    retry: false,
  });
  return gates && (detect.data?.hasWorkspaces ?? false);
}

export function MigrationSection() {
  const { t } = useTranslation("settings");
  const { data: session } = useSession();
  const userId = session?.uid ?? null;

  const handleContinue = () => {
    try {
      clearCloudMigrationOutcome(localStorage, userId);
    } catch (e) {
      reportError("cloud_migration_storage", "clearing the outcome failed", e);
    }
    location.reload();
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("migration.title")}</h2>
      <p className="text-sm text-ink-muted mb-4">
        {t("migration.description")}
      </p>
      <Button className="rounded-full" onClick={handleContinue}>
        {t("migration.button")}
      </Button>
    </section>
  );
}
