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
  appName: string;
  eventApp: TriggerApp;
  accountId: string | undefined;
  setAccountId: (id: string) => void;
  catalogLoaded: boolean;
  catalogError: boolean;
  retryCatalog: () => void;
  backToApps: () => void;
}

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
