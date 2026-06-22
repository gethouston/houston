import { Button, ConfirmDialog } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../../../stores/agents";
import { useWorkspaceStore } from "../../../stores/workspaces";

export function DangerSection() {
  const { t } = useTranslation("settings");
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const deleteWorkspace = useWorkspaceStore((s) => s.delete);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!currentWorkspace) return null;

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
    <section>
      <h2 className="text-lg font-semibold text-destructive mb-1">
        {t("dangerZone.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("dangerZone.description")}
      </p>
      <Button
        variant="destructive"
        className="rounded-full"
        disabled={workspaces.length <= 1}
        onClick={() => setShowConfirm(true)}
      >
        {t("dangerZone.deleteButton")}
      </Button>
      {workspaces.length <= 1 && (
        <p className="text-xs text-muted-foreground mt-2">
          {t("dangerZone.createAnotherFirst")}
        </p>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t("dangerZone.confirmTitle", { name: currentWorkspace.name })}
        description={t("dangerZone.confirmDescription")}
        confirmLabel={t("dangerZone.confirmLabel")}
        onConfirm={handleDelete}
      />
    </section>
  );
}
