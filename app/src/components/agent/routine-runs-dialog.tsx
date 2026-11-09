/** Routine execution history with translated summaries for typed failures. */

import {
  formatLocalDateTime,
  type RoutineReaderAccount,
  type RoutineRun,
  routineFailureCode,
} from "@houston/sdk";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { RoutineRunList, type RunStatus } from "@houston-ai/routines";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { providerName } from "../../lib/providers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drawn above the history: why runs may be missing (the Free plan's
   *  skipped events). Mounts only while the dialog is open. */
  notice?: ReactNode;
  /** Newest-first runs of ONE routine; undefined while loading. */
  runs: RoutineRun[] | undefined;
  runsLoading: boolean;
  locale: string;
  /** Opens the clicked run's chat (the caller closes the modal first). */
  onOpenRun: (run: RoutineRun) => void;
  /** The reader's own account for a provider (`useRoutineReader`); without
   *  it every failure reads as the engine recorded it. */
  readerFor?: (provider: string) => RoutineReaderAccount;
}

export function RoutineRunsDialog({
  open,
  onOpenChange,
  notice,
  runs,
  runsLoading,
  locale,
  onOpenRun,
  readerFor,
}: Props) {
  const { t } = useTranslation("routines");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("details.runsTitle")}</DialogTitle>
        </DialogHeader>
        {notice}
        <div className="max-h-[60dvh] min-h-0 overflow-y-auto">
          {runsLoading ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm text-ink-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t("details.runsLoading")}
            </p>
          ) : (
            <RoutineRunsHistory
              runs={runs ?? []}
              onOpenRun={onOpenRun}
              locale={locale}
              readerFor={readerFor}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The same history body is used in the modal on desktop and web. */
export function RoutineRunsHistory({
  runs,
  locale,
  onOpenRun,
  readerFor,
}: Pick<Props, "locale" | "onOpenRun" | "readerFor"> & { runs: RoutineRun[] }) {
  const { t } = useTranslation("routines");

  // Spelled out per code rather than built from it: `t()` keys are typed, so a
  // template-literal key would compile past a typo the locale validator can't
  // see. `undefined` keeps the run's own summary.
  const failureSummary = (run: RoutineRun): string | undefined => {
    const provider =
      run.failure && "provider" in run.failure
        ? providerName(run.failure.provider)
        : "";
    // An account the gateway signed out reads as "sign in again", not as
    // never connected (the SDK's `routineFailureCode` with the reader).
    switch (routineFailureCode(run, readerFor)) {
      case "pool_delivery_expired":
        return t("details.failure.poolDeliveryExpired");
      case "creator_no_access":
        return t("details.failure.creatorNoAccess");
      case "agent_data_needs_repair":
        return t("details.failure.agentDataNeedsRepair");
      case "creator_not_connected":
        return t("details.failure.creatorNotConnected", { provider });
      case "team_not_connected":
        return t("details.failure.teamNotConnected", { provider });
      case "creator_needs_reconnect":
        return t("details.failure.creatorNeedsReconnect", { provider });
      case "team_needs_reconnect":
        return t("details.failure.teamNeedsReconnect", { provider });
      case "out_of_credits":
        return t("details.failure.outOfCredits", { provider });
      case "model_unavailable":
        return t("details.failure.modelUnavailable", { provider });
      case "no_model":
        return t("details.failure.noModel");
      case "usage_limit": {
        const resetsAt =
          run.failure?.code === "usage_limit" ? run.failure.resets_at : null;
        return resetsAt && Number.isFinite(Date.parse(resetsAt))
          ? t("details.failure.usageLimit", {
              provider,
              time: formatLocalDateTime(resetsAt, locale),
            })
          : t("details.failure.usageLimitNoReset", { provider });
      }
    }
  };

  return (
    <RoutineRunList
      runs={runs}
      onOpenRun={onOpenRun}
      locale={locale}
      summaryFor={failureSummary}
      labels={{
        empty: t("details.runsEmpty"),
        openRun: t("details.openRun"),
        status: t("details.status", { returnObjects: true }) as Record<
          RunStatus,
          string
        >,
      }}
    />
  );
}
