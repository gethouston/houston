import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isMissingSkillError } from "../../lib/missing-skill";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";

export function useMissingSkillDismiss(args: {
  row: ManagedSkillRow | null;
  error: unknown;
  isShared: boolean;
  shared: SharedDialogActions | undefined;
  onClose: () => void;
}): void {
  const { row, error, isShared, shared, onClose } = args;
  const { t } = useTranslation("skills");
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const workspaceId = shared?.workspaceId;
  const slug = row?.slug ?? "";
  const holders = (row?.agents ?? [])
    .map((agent) => agent.folderPath)
    .join(" ");

  useEffect(() => {
    if (!error || !isMissingSkillError(error)) return;
    addToast({ variant: "info", title: t("detail.unavailableToast") });
    onClose();
    if (isShared && workspaceId) {
      qc.invalidateQueries({ queryKey: queryKeys.sharedSkills(workspaceId) });
      return;
    }
    for (const path of holders ? holders.split(" ") : []) {
      qc.invalidateQueries({ queryKey: queryKeys.skills(path) });
      qc.invalidateQueries({ queryKey: queryKeys.skillDetail(path, slug) });
    }
  }, [error, isShared, workspaceId, holders, slug, addToast, onClose, qc, t]);
}
