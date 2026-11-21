import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-report";
import { useUIStore } from "../../stores/ui";
import { ProviderBrowser } from "../provider-browser/provider-browser";
import { useProviderBrowserData } from "../provider-browser/use-provider-browser-data";
import { FirstRunScreen } from "./first-run-screen";
import { SetupCard } from "./setup-card";

interface MigrationReconnectScreenProps {
  onDone: () => Promise<void>;
}

export function MigrationReconnectScreen({
  onDone,
}: MigrationReconnectScreenProps) {
  const { t } = useTranslation("setup");
  const addToast = useUIStore((s) => s.addToast);
  const { providers, connections, catalog } = useProviderBrowserData();

  const finish = (source: "connected" | "skipped") => {
    analytics.track("migration_reconnect_completed", { source });
    onDone().catch((err) => {
      addToast({
        title: t("migrationReconnect.dismissError"),
        description: genericErrorDescription(
          "migration_reconnect_dismiss",
          err,
        ),
        variant: "error",
      });
    });
  };

  return (
    <FirstRunScreen>
      <SetupCard
        title={t("migrationReconnect.title")}
        subtitle={t("migrationReconnect.body")}
        helper={
          <button
            type="button"
            onClick={() => finish("skipped")}
            className="underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            {t("migrationReconnect.skip")}
          </button>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProviderBrowser
            providers={providers}
            connections={connections}
            catalog={catalog}
            onSelect={() => finish("connected")}
            selectOnMount
          />
        </div>
      </SetupCard>
    </FirstRunScreen>
  );
}
