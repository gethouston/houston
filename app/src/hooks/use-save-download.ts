import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../lib/error-report";
import { showExpectedStateToast } from "../lib/error-toast";
import { planFileOpFailure } from "../lib/file-op-failure";
import { logger } from "../lib/logger";
import { osRevealPath } from "../lib/os-bridge";
import { saveBlob } from "../lib/save-blob";
import { useUIStore } from "../stores/ui";

/**
 * Save a downloaded Blob to the user's machine and toast the outcome.
 *
 * Browser builds stay silent on success (the browser shows its own download
 * UI); the desktop shell writes the file natively and gets a "Saved" toast
 * with a reveal action. Never rejects — a failure surfaces as a toast (beta
 * policy: no silent failures), a cancelled save dialog stays quiet.
 *
 * The shell rejects typed (`file-op-failure.ts`): the destination open in
 * another program, a protected folder, a full disk are states the user can
 * fix and read as informational copy with no report; only `other` is a bug
 * (PRODUCT-1732). The raw OS diagnostic always reaches the frontend log.
 */
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
                  description: genericErrorDescription("reveal_download", err),
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
          description: genericErrorDescription("save_download", err),
        });
      }
    },
    [addToast, t],
  );
}
