import type { ReactNode } from "react";
import {
  SkillPreviewModal,
  type SkillPreviewState,
} from "./skill-preview-modal";
import type { SkillPreviewSheetLabels } from "./skill-preview-modal-labels";
import type { CommunitySkill } from "./types";
import type { MarketplaceInstallState } from "./use-skill-marketplace-state";

/**
 * The marketplace's detail overlay: {@link SkillPreviewModal} plus the one
 * derivation it needs, which is whether THIS skill counts as installed. A skill
 * is installed either because this session just installed it (the section's
 * install state) or because it was already on disk when the page loaded (the
 * lowercase installed-slug set).
 */
export function SkillMarketplaceDetail({
  skill,
  preview,
  installState,
  installedSkillNames,
  onInstall,
  onClose,
  renderIntegrations,
  labels,
}: {
  skill: CommunitySkill | null;
  preview: SkillPreviewState;
  installState: MarketplaceInstallState;
  installedSkillNames?: Set<string>;
  onInstall: (skill: CommunitySkill) => void;
  onClose: () => void;
  renderIntegrations?: (slugs: string[]) => ReactNode;
  labels?: SkillPreviewSheetLabels;
}) {
  const entry = skill ? installState.get(skill.id) : undefined;
  const slug = skill ? (skill.skillId || skill.name).toLowerCase() : null;
  const installed =
    entry === "installed" ||
    (slug !== null && (installedSkillNames?.has(slug) ?? false));

  return (
    <SkillPreviewModal
      open={skill !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      skill={skill}
      preview={preview}
      installing={entry === "installing"}
      installed={installed}
      onInstall={() => skill && onInstall(skill)}
      renderIntegrations={renderIntegrations}
      labels={labels}
    />
  );
}
