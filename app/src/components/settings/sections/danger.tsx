import { Button, ConfirmDialog } from "@houston-ai/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useSurfaceGates } from "../../../hooks/use-surface-gates";
import { canReadTeamBillingSummary } from "../../../lib/billing-gates";
import { showExpectedStateToast } from "../../../lib/error-toast";
import { openHome } from "../../../lib/home-nav";
import { tellOptimisticRefusal } from "../../../lib/optimistic-write";
import { tauriOrg } from "../../../lib/tauri";
import {
  canDeleteOptimistically,
  classifyWorkspaceDeleteError,
  isExpectedWorkspaceDeleteError,
  type WorkspaceDeleteFailure,
} from "../../../lib/workspace-delete-model";
import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

export function DangerSection() {
  const { t } = useTranslation("settings");
  const { showWorkspaceDanger } = useSurfaceGates();
  const { capabilities } = useCapabilities();
  const readsBilling = canReadTeamBillingSummary(capabilities, true);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const deleteWorkspace = useWorkspaceStore((s) => s.delete);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!currentWorkspace) return null;
  if (!showWorkspaceDanger) return null;

  const toastAndLandHome = async (name: string) => {
    addToast({
      title: t("dangerZone.deleted", { name }),
      variant: "success",
    });
    const landing = useWorkspaceStore.getState().current;
    if (landing) await loadAgents(landing.id);
    openHome();
  };

  const refusedToast = (err: unknown, name: string): void => {
    const failure: WorkspaceDeleteFailure = classifyWorkspaceDeleteError(err);
    if (failure === "unknown") {
      tellOptimisticRefusal("delete_workspace", err, {
        title: t("writeFailed.deleteWorkspace.title", { name }),
        description: t("writeFailed.deleteWorkspace.description"),
      });
      return;
    }
    showExpectedStateToast(
      t(`dangerZone.blocked.${failure}.title`),
      t(`dangerZone.blocked.${failure}.body`),
    );
  };

  const handleDelete = async () => {
    const { id, name } = currentWorkspace;
    try {
      const provablyDeletable = await Promise.all([
        tauriOrg.get(),
        readsBilling ? tauriOrg.getBilling() : null,
      ]).then(
        ([info, billing]) => canDeleteOptimistically(info.members, billing),
        () => false,
      );
      if (provablyDeletable) {
        const settled = deleteWorkspace(
          id,
          { silence: isExpectedWorkspaceDeleteError },
          "optimistic",
        ).then(
          () => null,
          (err: unknown) => ({ err }),
        );
        await toastAndLandHome(name);
        const refused = await settled;
        if (refused) refusedToast(refused.err, name);
        return;
      }
      try {
        await deleteWorkspace(id, { silence: isExpectedWorkspaceDeleteError });
      } catch (err) {
        refusedToast(err, name);
        return;
      }
      await toastAndLandHome(name);
    } finally {
      setShowConfirm(false);
    }
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
        pendingLabel={t("dangerZone.deleting")}
        onConfirm={handleDelete}
      />
    </>
  );
}
