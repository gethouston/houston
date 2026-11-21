import { durationMs } from "@houston/design-tokens";
import { Button, Spinner } from "@houston-ai/core";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type EmployeeCardStatus,
  type EmployeeStatusMark,
  employeeStatusView,
} from "./employee-card-model";

export interface EmployeeCardRecovery {
  name: string;
  onRetry: () => void;
  onRemove?: () => void;
}

export function EmployeeCardFoot({
  status,
  recovery,
}: {
  status: EmployeeCardStatus;
  recovery?: EmployeeCardRecovery;
}) {
  const { t } = useTranslation(["shell", "common"]);
  const view = employeeStatusView(status);
  if (status === "draft") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <div role="status" aria-live="polite" className="relative min-w-0">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.p
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durationMs.fast / 1000 }}
            className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted"
          >
            <StatusMark mark={view.mark} />
            <span className="truncate">
              {t(`shell:employeeCard.status.${status}`)}
            </span>
          </motion.p>
        </AnimatePresence>
      </div>
      {view.offersActions && recovery && (
        <span className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-11 rounded-full px-4 text-xs md:h-7 md:px-3"
            onClick={recovery.onRetry}
            aria-label={t("shell:employeeCard.retryLabel", {
              name: recovery.name,
            })}
          >
            {t("common:actions.retry")}
          </Button>
          {recovery.onRemove && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11 rounded-full px-4 text-xs md:h-7 md:px-3"
              onClick={recovery.onRemove}
              aria-label={t("shell:employeeCard.removeLabel", {
                name: recovery.name,
              })}
            >
              {t("common:actions.remove")}
            </Button>
          )}
        </span>
      )}
    </div>
  );
}

function StatusMark({ mark }: { mark: EmployeeStatusMark }) {
  switch (mark) {
    case "spinner":
      return <Spinner className="size-3" />;
    case "successDot":
      return (
        <span aria-hidden="true" className="size-2 rounded-full bg-success" />
      );
    case "alert":
      return <CircleAlert aria-hidden="true" className="size-3 text-danger" />;
    case null:
      return null;
  }
}
