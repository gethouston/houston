import { useCallback } from "react";

/**
 * Routing for a "Your skills" strip row click: a workspace-store row opens
 * the shared preview (there is no per-agent copy for the manage dialog to
 * edit, ADR 0003); read-only surfaces open the raw modal; everything else
 * opens the per-agent manage dialog.
 */
export function useOpenInstalledSkill(args: {
  readOnly: boolean;
  sharedSkillSlugs?: Set<string>;
  onOpenSharedSkill?: (slug: string) => void;
  onEditSkill: (name: string) => void;
  onManageSkill: (name: string) => void;
}): (name: string) => void {
  const {
    readOnly,
    sharedSkillSlugs,
    onOpenSharedSkill,
    onEditSkill,
    onManageSkill,
  } = args;
  return useCallback(
    (name: string) => {
      if (
        !readOnly &&
        onOpenSharedSkill &&
        sharedSkillSlugs?.has(name.toLowerCase())
      )
        onOpenSharedSkill(name);
      else if (readOnly) onEditSkill(name);
      else onManageSkill(name);
    },
    [readOnly, onOpenSharedSkill, sharedSkillSlugs, onEditSkill, onManageSkill],
  );
}
