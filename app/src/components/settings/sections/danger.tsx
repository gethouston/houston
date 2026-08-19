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
 *
 * Confirming is optimistic (PRODUCT-1426): the user lands on the default
 * space with a success toast immediately, while the gateway delete finishes
 * behind the switch. A rejection restores the row (the store's rollback) and
 * the blocked toast then explains what to do — its "first, then delete"
 * wording is what tells the user the space was NOT deleted after all.
 */
export function DangerSection() {
  const { t } = useTranslation("settings");
  const { capabilities } = useCapabilities();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const deleteWorkspace = useWorkspaceStore((s) => s.delete);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!currentWorkspace) return null;
  if (!capabilities?.workspaceDelete) return null;
  if (!isTeamWorkspace(currentWorkspace.id)) return null;
  if (!canDeleteWorkspace(capabilities)) return null;

  const handleDelete = async () => {
    const { id, name } = currentWorkspace;
    setShowConfirm(false);
    // Optimistic (PRODUCT-1426): the store drops the row, lands on the default
    // space and re-pins the gateway BEFORE the server round-trip, so the
    // switch and toast below are instant instead of gated on a slow gateway
    // delete. The rejection handler attaches NOW (an unobserved rejection
    // during the navigation awaits would fire unhandledrejection); a failure
    // classifies here and toasts after the switch — nothing is swallowed:
    // unknown errors are already reported by the wire layer, and the store has
    // already restored the row.
    const settled = deleteWorkspace(id, {
      silence: isExpectedWorkspaceDeleteError,
    }).then(() => null, classifyWorkspaceDeleteError);
    const landing = useWorkspaceStore.getState().current;
    if (landing) await loadAgents(landing.id);
    // The active space just switched under the user; Settings belonged to the
    // deleted one. Land them on home so the switch is visible.
    openHome();
    addToast({
      title: t("dangerZone.deleted", { name }),
      variant: "success",
    });
    const failure = await settled;
    if (failure === null || failure === "unknown") return;
    showExpectedStateToast(
      t(`dangerZone.blocked.${failure}.title`),
      t(`dangerZone.blocked.${failure}.body`),
    );
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
