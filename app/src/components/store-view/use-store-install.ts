import { pingStoreInstall } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../lib/engine";
import { reportError } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

/**
 * One-click install from the Agent Store: fetch the listing through the host
 * (the exact `importFromStoreLink` path the "Install from a link" panel uses,
 * SSRF-guarded and IR-validated), seed the import wizard with the preview and
 * open it — so scan choice, naming, and content pickers stay identical to
 * every other way an agent arrives. The install counter ping is fire-and-
 * forget: it must never block or fail an install, only a Sentry report.
 */
export function useStoreInstall() {
  const { t } = useTranslation("store");
  const addToast = useUIStore((s) => s.addToast);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  /** Returns true when the wizard opened (callers close their own surface). */
  const install = async (slug: string): Promise<boolean> => {
    if (installingSlug) return false;
    setInstallingSlug(slug);
    try {
      const preview = await getEngine().importFromStoreLink(slug);
      const ui = useUIStore.getState();
      ui.setImportSeedPreview(preview);
      ui.setImportFromFriendOpen(true);
      pingStoreInstall(slug).catch((err: unknown) => {
        reportError("store_install_ping", `install ping failed (${slug})`, err);
      });
      return true;
    } catch (err) {
      reportError("store_install", `store install failed (${slug})`, err);
      addToast({
        variant: "error",
        title: t("installFailed"),
      });
      return false;
    } finally {
      setInstallingSlug(null);
    }
  };

  return { install, installingSlug };
}
