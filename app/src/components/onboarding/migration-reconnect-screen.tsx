import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { useUIStore } from "../../stores/ui";
import { HoustonLogo } from "../shell/experience-card";
import { ProviderPicker } from "../shell/provider-picker";

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
 * The connect flow is the SAME `<ProviderPicker>` used in onboarding and
 * settings — it owns the OAuth launch, the device-code / login dialogs, the
 * status polling, and the failure toasts (no silent failures), and fires
 * `onSelect` the instant a provider connects. We react to that by persisting
 * the "seen" flag and dismissing; the App-level gate then falls through to the
 * normal shell.
 */
export function MigrationReconnectScreen({
  onDone,
}: MigrationReconnectScreenProps) {
  const { t } = useTranslation("setup");
  const addToast = useUIStore((s) => s.addToast);

  const finish = (source: "connected" | "skipped") => {
    analytics.track("migration_reconnect_completed", { source });
    onDone().catch((err) => {
      // Persisting the "seen" flag failed — surface it (no silent failure) so
      // the user can report it. We do NOT block the user behind the gate: the
      // shell is already usable once a provider connected, and a returning
      // session re-evaluates the flag, so at worst the moment shows once more.
      addToast({
        title: t("migrationReconnect.dismissError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    });
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <HoustonLogo size={56} />
        <h1 className="text-[28px] font-normal leading-tight">
          {t("migrationReconnect.title")}
        </h1>
        <p className="text-base text-muted-foreground">
          {t("migrationReconnect.body")}
        </p>

        <div className="w-full">
          <ProviderPicker onSelect={() => finish("connected")} />
        </div>

        <button
          type="button"
          onClick={() => finish("skipped")}
          className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("migrationReconnect.skip")}
        </button>
      </div>
    </div>
  );
}
