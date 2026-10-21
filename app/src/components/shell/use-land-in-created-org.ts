import type { OrgSummary } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import { openHome } from "../../lib/home-nav";
import { openAdmin } from "../../lib/open-admin";
import { orgSlugFromWorkspaceId } from "../../lib/space-id";
import { tauriSystem } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * Switch into an org the create dialog just made and say so. The switch is
 * the workspaces store's `setCurrent`, which IS the C8 E3 sequence (re-point
 * `x-houston-org`, drop the query cache, re-establish the event stream), never
 * re-implemented here. `useCreateTeam`'s own onSuccess already reloaded the
 * workspaces, so this only reads the store.
 *
 * A paid org waits on its checkout, so its toast says where to finish paying
 * instead of inviting people. When no browser took the checkout, the toast
 * carries the link as its action, which runs inside a click and so opens.
 */
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
      // The active space just switched under the user. If they opened this
      // from Settings (or any non-home view, or an agent that belonged to the
      // old space and the reload above just dropped), the view would stay put
      // and the whole create reads as a silent failure. Land them on home,
      // the same place the shell sends a blocked view, so the switch is
      // visible.
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
