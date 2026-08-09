import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@houston-ai/core";
import type { TriggerApp } from "@houston-ai/routines";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppRow } from "../../integrations/app-row";

interface IntakeTriggerSelectedProps {
  /** The picked app's display name, for the hint + loading copy. */
  appName: string;
  /** The connected app (with its accounts) whose account may need pinning. */
  eventApp: TriggerApp;
  /** The currently pinned account id (multi-account apps only). */
  accountId: string | undefined;
  setAccountId: (id: string) => void;
  /** The background event-catalog fetch state (the CTA gates on it). */
  catalogLoaded: boolean;
  catalogError: boolean;
  retryCatalog: () => void;
  /** Return to the app grid within the trigger card. */
  backToApps: () => void;
}

/**
 * The trigger card's "app selected" body, kept deliberately spare: the picked
 * app as one shared {@link AppRow} with an inline change affordance, an account
 * picker ONLY when the app has more than one connection, one plain-words hint,
 * and the background catalog fetch state (an inline, always-visible error with
 * Retry, never a silent empty pick). Extracted from the trigger card to keep
 * each file under the size cap.
 */
export function IntakeTriggerSelected({
  appName,
  eventApp,
  accountId,
  setAccountId,
  catalogLoaded,
  catalogError,
  retryCatalog,
  backToApps,
}: IntakeTriggerSelectedProps): ReactNode {
  const { t } = useTranslation("routines");
  return (
    <div className="flex flex-col gap-3">
      <AppRow
        display={{
          toolkit: eventApp.toolkit,
          name: appName,
          description: "",
          logoUrl: eventApp.logoUrl ?? "",
        }}
        trailing={
          <button
            className="text-ink-muted text-xs transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
            onClick={backToApps}
            type="button"
          >
            {t("triggerStep.change")}
          </button>
        }
      />

      {eventApp.accounts.length > 1 && (
        <div className="space-y-1.5">
          <p className="font-medium text-ink text-xs">
            {t("triggerStep.accountLabel")}
          </p>
          <Select onValueChange={setAccountId} value={accountId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("triggerStep.accountPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {eventApp.accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className="text-ink-muted text-sm leading-snug">
        {t("triggerStep.selectedHint", { app: appName })}
      </p>

      {catalogError ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-danger">{t("triggerStep.catalogError")}</span>
          <button
            className="inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={retryCatalog}
            type="button"
          >
            <RotateCw className="size-3.5" />
            {t("triggerStep.retry")}
          </button>
        </div>
      ) : catalogLoaded ? null : (
        <div className="flex items-center gap-2 text-ink-muted text-sm">
          <Spinner className="size-4" />
          {t("triggerStep.loadingCatalog", { app: appName })}
        </div>
      )}
    </div>
  );
}
