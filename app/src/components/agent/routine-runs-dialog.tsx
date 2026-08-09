/**
 * RoutineRunsDialog — the execution history as an emergent modal
 * (PRODUCT-1208), n8n-style: every recorded run with its outcome, date, time,
 * elapsed time, and (when the run wasn't silent) the result it left behind.
 * Clicking an entry closes the modal and opens that run's chat.
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("details.runsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] min-h-0 overflow-y-auto">
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
