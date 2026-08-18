import { Button, ConfirmDialog } from "@houston-ai/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { showExpectedStateToast } from "../../../lib/error-toast";
import { openHome } from "../../../lib/home-nav";
import { canDeleteWorkspace } from "../../../lib/org-roles";
import { isTeamWorkspace } from "../../../lib/space-id";
import {
  classifyWorkspaceDeleteError,
  isExpectedWorkspaceDeleteError,
} from "../../../lib/workspace-delete-model";
import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

/**
 * Settings → Danger Zone: delete the ACTIVE team space for good (PRODUCT-1410).
 *
 * Shown only when all three hold — the deployment can delete a space at all
 * (`capabilities.workspaceDelete`, the gateway's feature-detect flag: absent on
 * desktop/self-host, where the one personal workspace is not deletable, and on
 * gateways that predate the route), the active space is a team (a personal
 * space goes with the account, never on its own), and the caller owns it
 * (PRODUCT-1247). Cosmetic gates all: the gateway is the sole enforcer, and
 * its two business rejections (`has_members`, `subscription_active`) come
 * back as plain informational toasts that say what to do first.
 */
export function DangerSection() {
  const { t } = useTranslation("settings");
  const { capabilities } = useCapabilities();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const deleteWorkspace = useWorkspaceStore((s) => s.delete);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!currentWorkspace) return null;
  if (!capabilities?.workspaceDelete) return null;
  if (!isTeamWorkspace(currentWorkspace.id)) return null;
  if (!canDeleteWorkspace(capabilities)) return null;

  const handleDelete = async () => {
    const name = currentWorkspace.name;
    setDeleting(true);
    try {
      // The store lands on the default space + re-pins the gateway once the
      // server confirms; every other rejection is toasted by the wire layer.
      await deleteWorkspace(currentWorkspace.id, {
        silence: isExpectedWorkspaceDeleteError,
      });
    } catch (err) {
      const failure = classifyWorkspaceDeleteError(err);
      if (failure === "unknown") return; // red toast + report already shown
      showExpectedStateToast(
        t(`dangerZone.blocked.${failure}.title`),
        t(`dangerZone.blocked.${failure}.body`),
      );
      return;
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
    const landing = useWorkspaceStore.getState().current;
    if (landing) await loadAgents(landing.id);
    // The active space just switched under the user; Settings belonged to the
    // deleted one. Land them on home so the switch is visible.
    openHome();
    addToast({
      title: t("dangerZone.deleted", { name }),
      variant: "success",
    });
  };

  return (
    <>
      <SettingsControlRow
        icon={Trash2}
        title={t("nav.danger")}
        description={t("dangerZone.description")}
        destructive
      >
        <Button
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={() => setShowConfirm(true)}
        >
          {t("dangerZone.confirmLabel")}
        </Button>
      </SettingsControlRow>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t("dangerZone.confirmTitle", { name: currentWorkspace.name })}
        description={t("dangerZone.confirmDescription")}
        confirmLabel={t("dangerZone.confirmLabel")}
        onConfirm={handleDelete}
      />
    </>
  );
}
