import type { OrgSummary } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import { openHome } from "../../lib/home-nav";
import { openAdmin } from "../../lib/open-admin";
import { orgSlugFromWorkspaceId } from "../../lib/space-id";
import { tauriSystem } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

export function useLandInCreatedOrg() {
  const { t } = useTranslation("teams");
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  return async (
    org: OrgSummary,
    paying: { fallbackUrl: string | null } | null,
  ) => {
    const ws = useWorkspaceStore
      .getState()
      .workspaces.find((w) => orgSlugFromWorkspaceId(w.id) === org.slug);
    if (ws) {
      setCurrentWorkspace(ws);
      await loadAgents(ws.id);
      openHome();
    }
    if (paying) {
      const { fallbackUrl } = paying;
      addToast({
        title: t("createTeam.paidSuccessTitle", { name: org.name }),
        description: fallbackUrl
          ? t("createTeam.paidBlockedBody")
          : t("createTeam.paidSuccessBody"),
        ...(fallbackUrl && {
          action: {
            label: t("billing.openCheckout"),
            onClick: () =>
              void tauriSystem.openUrl(fallbackUrl, {
                command: "billing_checkout_open",
              }),
          },
        }),
      });
      return;
    }
    addToast({
      title: t("createTeam.successTitle", { name: org.name }),
      description: t("createTeam.successBody"),
      variant: "success",
      action: {
        label: t("createTeam.successAction"),
        onClick: () => openAdmin(),
      },
    });
  };
}
