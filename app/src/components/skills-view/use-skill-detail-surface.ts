import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeys } from "../../lib/query-keys";
import { tauriSharedSkills, tauriSkills } from "../../lib/tauri";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";
import { useMissingSkillDismiss } from "./use-missing-skill-dismiss";

export type SkillAssignmentMode = "editable" | "locked";

export function useSkillDetailSurface(args: {
  row: ManagedSkillRow | null;
  shared?: SharedDialogActions;
  onLeave: () => void;
}) {
  const { row, shared, onLeave } = args;
  const isShared = shared !== undefined && row?.origin === "shared";
  const assignment: SkillAssignmentMode =
    shared !== undefined && row?.origin === "local" ? "locked" : "editable";
  const canonicalPath = row?.agents[0]?.folderPath;
  const slug = row?.slug;

  const {
    data: detail,
    error,
    refetch,
  } = useQuery({
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

  const [rename, setRename] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: slug is the intentional change-trigger — a pending rename must die with the row it was typed for; the effect body deliberately reads none of it.
  useEffect(() => {
    setRename(null);
  }, [slug]);

  return {
    isShared,
    store: isShared ? shared : undefined,
    assignment,
    canonicalPath,
    detail,
    error,
    refetch,
    rename,
    setRename,
  };
}
