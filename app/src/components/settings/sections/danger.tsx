import { Button, ConfirmDialog } from "@houston-ai/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../../../stores/agents";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

export function DangerSection() {
  const { t } = useTranslation("settings");
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const deleteWorkspace = useWorkspaceStore((s) => s.delete);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!currentWorkspace) return null;

  const isOnlyWorkspace = workspaces.length <= 1;

  const handleDelete = async () => {
    const remaining = workspaces.filter((w) => w.id !== currentWorkspace.id);
    await deleteWorkspace(currentWorkspace.id);
    setShowConfirm(false);
    if (remaining.length > 0) {
      setCurrentWorkspace(remaining[0]);
      await loadAgents(remaining[0].id);
    }
  };

  return (
    <>
      <SettingsControlRow
        icon={Trash2}
        title={t("nav.danger")}
        description={
          isOnlyWorkspace
            ? t("dangerZone.createAnotherFirst")
            : t("dangerZone.description")
        }
        destructive
      >
        <Button
          variant="destructive"
          size="sm"
          disabled={isOnlyWorkspace}
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
