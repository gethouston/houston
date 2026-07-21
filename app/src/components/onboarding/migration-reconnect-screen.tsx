import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { genericErrorDescription } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";
import { ProviderBrowser } from "../provider-browser/provider-browser";
import { useProviderBrowserData } from "../provider-browser/use-provider-browser-data";
import { FirstRunScreen } from "./first-run-screen";
import { SetupCard } from "./setup-card";

interface MigrationReconnectScreenProps {
  /**
   * Persist that this one-time moment is done. Called both when a provider
   * connects (via the picker's `onSelect`) and when the user chooses to
   * continue without reconnecting.
   */
  onDone: () => Promise<void>;
}

/**
 * The one-time "reconnect your AI" moment a user sees after upgrading from the
 * legacy desktop build. Their agents and history migrated, but their AI sign-in
 * did not, so we welcome them back and walk them through reconnecting once.
 *
 * The connect flow is the SAME `<ProviderBrowser>` used in onboarding and the
 * AI Hub — it owns the OAuth launch, the device-code / login dialogs, the
 * status polling, and the failure toasts (no silent failures), and fires
 * `onSelect` the instant a provider connects. We react to that by persisting
 * the "seen" flag and dismissing; the App-level gate then falls through to the
 * normal shell. `selectOnMount` finishes the moment we detect an
 * already-connected provider on the first status snapshot too.
 */
export function MigrationReconnectScreen({
  onDone,
}: MigrationReconnectScreenProps) {
  const { t } = useTranslation("setup");
  const addToast = useUIStore((s) => s.addToast);
  const { providers, connections, catalog } = useProviderBrowserData();

  const finish = (source: "connected" | "skipped") => {
    analytics.track("migration_reconnect_completed", { source });
    onDone().catch((err) => {
      // Persisting the "seen" flag failed — surface it (no silent failure) so
      // the user can report it. We do NOT block the user behind the gate: the
      // shell is already usable once a provider connected, and a returning
      // session re-evaluates the flag, so at worst the moment shows once more.
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
