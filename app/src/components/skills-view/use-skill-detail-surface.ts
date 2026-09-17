import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkills } from "../../lib/tauri";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./manage-skill-dialog-props";
import { useMissingSkillDismiss } from "./use-missing-skill-dismiss";

/** How the "Agents with this skill" list behaves for a row, by its origin. */
export type SkillAssignmentMode = "editable" | "locked";

/**
 * Everything the two skill detail surfaces — the per-agent manage dialog and
 * the library's full-page editor — need before either of them is a surface:
 * which copy of the skill is canonical, who may be assigned it, the SKILL.md
 * itself, and the uncommitted rename typed into the title.
 *
 * Both read the SAME query key, which is what lets a chat rewriting SKILL.md
 * (`SkillsChanged` / `SharedSkillsChanged`) move whichever of them is open. The
 * one load failure that is not Houston's fault — the skill was deleted under
 * the open surface — leaves through {@link useMissingSkillDismiss} with a toast
 * that says so.
 */
export function useSkillDetailSurface(args: {
  /** The open row; null keeps the dialog closed and the query idle. */
  row: ManagedSkillRow | null;
  shared?: SharedDialogActions;
  /** Leave the surface: the dialog closes, the editor returns to the list. */
  onLeave: () => void;
}) {
  const { row, shared, onLeave } = args;
  const isShared = shared !== undefined && row?.origin === "shared";
  // On a shared-store deployment a LOCAL row never offers copy fan-out:
  // holders render read-only and multi-agent use goes through "Share to
  // workspace" (ADR 0003), so the checkbox list can't be mistaken for the
  // org-level assignment it isn't.
  const assignment: SkillAssignmentMode =
    shared !== undefined && row?.origin === "local" ? "locked" : "editable";
  const canonicalPath = row?.agents[0]?.folderPath;
  const slug = row?.slug;

  const { data: detail, error } = useQuery({
    queryKey: isShared
      ? queryKeys.sharedSkillDetail(shared.workspaceId, slug ?? "")
      : queryKeys.skillDetail(canonicalPath ?? "", slug ?? ""),
    queryFn: () =>
      isShared
        ? tauriSharedSkills.load(shared.workspaceId, slug ?? "")
        : tauriSkills.load(canonicalPath ?? "", slug ?? ""),
    enabled: row !== null && (isShared || canonicalPath !== undefined),
    staleTime: 30_000,
  });
  useMissingSkillDismiss({ row, error, isShared, shared, onClose: onLeave });

  // The header pencil's uncommitted rename (PRODUCT-1018): saved into the
  // frontmatter `title:` when Save runs; the slug never moves.
  const [rename, setRename] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: slug is the intentional change-trigger — a pending rename must die with the row it was typed for; the effect body deliberately reads none of it.
  useEffect(() => {
    setRename(null);
  }, [slug]);

  return {
    isShared,
    /** The store handlers, present exactly when this row IS the store's copy —
     *  the narrowed form the shared-only branches need. */
    store: isShared ? shared : undefined,
    assignment,
    canonicalPath,
    detail,
    error,
    rename,
    setRename,
  };
}
