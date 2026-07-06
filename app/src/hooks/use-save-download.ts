import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "../lib/logger";
import { osRevealPath } from "../lib/os-bridge";
import { saveBlob } from "../lib/save-blob";
import { useUIStore } from "../stores/ui";

/**
 * Save a downloaded Blob to the user's machine and toast the outcome.
 *
 * Browser builds stay silent on success (the browser shows its own download
 * UI); the desktop shell writes the file natively and gets a "Saved" toast
 * with a reveal action. Never rejects — a failure surfaces as an error toast
 * (beta policy: no silent failures), a cancelled save dialog stays quiet.
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
          description: t("files.toasts.savedDescription", { name }),
          action: {
            label: t("files.toasts.revealAction"),
            onClick: () => {
              void osRevealPath(path).catch((err) =>
                addToast({
                  variant: "error",
                  title: t("files.toasts.revealFailed"),
                  description: String(err),
                }),
              );
            },
          },
        });
      } catch (err) {
        logger.error(`[files:save-download] ${String(err)}`, name);
        addToast({
          variant: "error",
          title: t("files.toasts.saveFailedTitle"),
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [t, addToast],
  );
}
