import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { describeError } from "../lib/describe-error";
import { reportError } from "../lib/error-report";
import { showExpectedStateToast } from "../lib/error-toast";
import {
  type FileOpFailurePlan,
  planFileOpFailure,
} from "../lib/file-op-failure";
import i18n from "../lib/i18n";
import { logger } from "../lib/logger";
import { osRevealPath } from "../lib/os-bridge";
import { saveBlob } from "../lib/save-blob";
import { useUIStore } from "../stores/ui";

export function useSaveDownload(): (name: string, blob: Blob) => Promise<void> {
  const { t } = useTranslation("agents");
  const addToast = useUIStore((s) => s.addToast);
  return useCallback(
    async (name: string, blob: Blob) => {
      try {
        const result = await saveBlob(name, blob);
        if (result.kind !== "saved" || result.path === null) return;
        const path = result.path;
        addToast({
          variant: "success",
          title: t("files.toasts.savedTitle"),
          description:
            result.renamedFrom === null
              ? t("files.toasts.savedDescription", { name: result.fileName })
              : t("files.toasts.savedRenamedDescription", {
                  name: result.fileName,
                  original: result.renamedFrom,
                }),
          action: {
            label: t("files.toasts.revealAction"),
            onClick: () => {
              void osRevealPath(path).catch((err) => {
                const plan = planFileOpFailure("reveal", err);
                logger.error(
                  `[files:reveal-download] ${plan.failure.kind}: ${plan.failure.message}`,
                );
                if (plan.surface === "expected") {
                  showExpectedStateToast(
                    t("files.toasts.revealFailed"),
                    t(`files.toasts.${plan.copy}`),
                  );
                  return;
                }
                addToast({
                  variant: "error",
                  title: t("files.toasts.revealFailed"),
                  description: reportFailure("reveal_download", plan, err),
                });
              });
            },
          },
        });
      } catch (err) {
        const plan = planFileOpFailure("save", err);
        logger.error(
          `[files:save-download] ${plan.failure.kind}: ${plan.failure.message}`,
          name,
        );
        if (plan.surface === "expected") {
          showExpectedStateToast(
            t("files.toasts.saveFailedTitle"),
            t(`files.toasts.${plan.copy}`),
          );
          return;
        }
        addToast({
          variant: "error",
          title: t("files.toasts.saveFailedTitle"),
          description: reportFailure("save_download", plan, err),
        });
      }
    },
    [addToast, t],
  );
}

function reportFailure(
  command: string,
  plan: FileOpFailurePlan,
  err: unknown,
): string {
  reportError(command, describeError(plan.failure), err);
  return i18n.t("shell:errorToast.genericDescription");
}
