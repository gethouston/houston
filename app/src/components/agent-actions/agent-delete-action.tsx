import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function AgentDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(["shell", "teams", "common"]);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("shell:agentDelete.title")}
      description={t("shell:agentDelete.description")}
      confirmLabel={t("teams:teamView.agentMenu.delete")}
      cancelLabel={t("common:actions.cancel")}
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}
