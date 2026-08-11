import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isMissingSkillError } from "../../lib/missing-skill";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./manage-skill-dialog-props";

/**
 * The one load failure that is NOT a Houston problem: the skill was deleted
 * while its row sat on screen (another window, an agent, a hand on the disk),
 * so the detail GET answers 404 ({@link isMissingSkillError}).
 *
 * A generic "couldn't load this skill's instructions" inside an open dialog
 * reads as a fault worth retrying, and it leaves the dead row on the page
 * behind it. This says the true thing in one calm toast, shuts the dialog
 * nothing is behind, and refetches the list the row came from so the row goes
 * away with it. Every OTHER load error keeps the dialog open with its inline
 * message, because retrying those is worth the user's time.
 */
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
  // The holders as one string: a fresh array every render would re-run the
  // effect on renders that changed nothing.
  const holders = (row?.agents ?? [])
    .map((agent) => agent.folderPath)
    .join(" ");

  useEffect(() => {
    if (!error || !isMissingSkillError(error)) return;
    addToast({ variant: "info", title: t("detail.unavailableToast") });
    onClose();
    if (isShared && workspaceId) {
      // The detail key rides the "shared-skills" prefix, so one invalidation
      // clears the list AND the 404 it just cached.
      qc.invalidateQueries({ queryKey: queryKeys.sharedSkills(workspaceId) });
      return;
    }
    for (const path of holders ? holders.split(" ") : []) {
      qc.invalidateQueries({ queryKey: queryKeys.skills(path) });
      qc.invalidateQueries({ queryKey: queryKeys.skillDetail(path, slug) });
    }
  }, [error, isShared, workspaceId, holders, slug, addToast, onClose, qc, t]);
}
