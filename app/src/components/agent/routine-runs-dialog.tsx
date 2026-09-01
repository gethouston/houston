/**
 * RoutineRunsDialog — the execution history as an emergent modal
 * (PRODUCT-1208), n8n-style: every recorded run with its outcome, date, time,
 * elapsed time, and (when the run wasn't silent) the result it left behind.
 * Clicking an entry closes the modal and opens that run's chat.
 *
 * A run that never reached the agent has no result to show: its AI account was
 * disconnected, needed reconnecting, or was out of credits (PRODUCT-1475). The
 * engine reports that as a typed `failure`, and `summaryFor` turns it into a
 * sentence naming the provider — so "Failed" stops being the whole story.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import {
  type RoutineRun,
  RoutineRunList,
  type RunStatus,
} from "@houston-ai/routines";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { providerName } from "../../lib/providers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Newest-first runs of ONE routine; undefined while loading. */
  runs: RoutineRun[] | undefined;
  runsLoading: boolean;
  locale: string;
  /** Opens the clicked run's chat (the caller closes the modal first). */
  onOpenRun: (run: RoutineRun) => void;
}

export function RoutineRunsDialog({
  open,
  onOpenChange,
  runs,
  runsLoading,
  locale,
  onOpenRun,
}: Props) {
  const { t } = useTranslation("routines");

  // Spelled out per code rather than built from it: `t()` keys are typed, so a
  // template-literal key would compile past a typo the locale validator can't
  // see. `undefined` keeps the run's own summary.
  const failureSummary = (run: RoutineRun): string | undefined => {
    if (!run.failure) return undefined;
    const provider = providerName(run.failure.provider);
    switch (run.failure.code) {
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
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("details.runsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60dvh] min-h-0 overflow-y-auto">
          {runsLoading ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm text-ink-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t("details.runsLoading")}
            </p>
          ) : (
            <RoutineRunList
              runs={runs ?? []}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
