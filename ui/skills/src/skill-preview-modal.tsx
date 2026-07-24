import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { InstallStatusIcon } from "./install-status-icon";
import { SkillDescription } from "./skill-description";
import {
  formatInstalls,
  kebabToTitle,
  ownerOf,
  repoOf,
} from "./skill-marketplace-util";
import { SkillOwnerAvatar } from "./skill-owner-avatar";
import {
  DEFAULT_SKILL_PREVIEW_LABELS,
  type SkillPreviewSheetLabels,
} from "./skill-preview-modal-labels";
import {
  SkillPreviewInstructions,
  SkillPreviewTaxonomy,
} from "./skill-preview-sections";
import { skillPreviewSections } from "./skill-preview-sections-model";
import type { CommunitySkill, CommunitySkillPreview } from "./types";

export type SkillPreviewState =
  | { status: "loading" }
  | { status: "loaded"; preview: CommunitySkillPreview }
  | { status: "error" };

export interface SkillPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: CommunitySkill | null;
  preview: SkillPreviewState;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  /**
   * Renders the apps the skill connects to, from its frontmatter toolkit slugs.
   * Optional because resolving a slug to a real app name + logo is a Composio
   * catalog concern owned by `app/`; without it the section simply doesn't show.
   */
  renderIntegrations?: (slugs: string[]) => ReactNode;
  labels?: SkillPreviewSheetLabels;
}

/**
 * SkillPreviewModal — the overlay detail modal for a marketplace skill,
 * replacing the old in-dialog body-swap sheet. It shows the owner avatar +
 * title + source, then the skill's plain-text SKILL.md description (loading
 * skeletons, then the parsed description or a "no description" note), the apps
 * it works with, its category + tags, the full SKILL.md body behind an
 * expander, and a full-width install button. Every one of those sections shows
 * only when the loaded preview carries it, so a bare skill looks exactly as it
 * did before. Install stays enabled even when the description fetch fails, so a
 * load error never blocks installing.
 */
export function SkillPreviewModal({
  open,
  onOpenChange,
  skill,
  preview,
  installing,
  installed,
  onInstall,
  renderIntegrations,
  labels,
}: SkillPreviewModalProps) {
  const l = { ...DEFAULT_SKILL_PREVIEW_LABELS, ...labels };
  const owner = skill ? ownerOf(skill.source) : "";
  const repo = skill ? repoOf(skill.source) : "";
  const loaded = preview.status === "loaded" ? preview.preview : null;
  const title = skill
    ? loaded?.title || kebabToTitle(skill.skillId || skill.name)
    : "";
  const sections = skillPreviewSections(loaded);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Capped to the viewport: an expanded instructions block (itself
          height-capped) must never push the dialog past the window. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {skill && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-4">
                <SkillOwnerAvatar owner={owner} size="lg" />
                <div className="min-w-0">
                  <DialogTitle className="truncate">{title}</DialogTitle>
                  <DialogDescription className="truncate">
                    {l.bySource(owner, repo)}
                  </DialogDescription>
                  {skill.installs > 0 && (
                    <p className="truncate text-ink-muted text-xs">
                      {l.installsCount(
                        skill.installs,
                        formatInstalls(skill.installs),
                      )}
                    </p>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div>
              {preview.status === "loading" && (
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-chip" />
                  <div className="h-3 w-11/12 animate-pulse rounded bg-chip" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-chip" />
                </div>
              )}
              {loaded &&
                (loaded.description ? (
                  <SkillDescription
                    description={loaded.description}
                    labels={l.description}
                  />
                ) : (
                  <p className="text-ink-muted text-sm">{l.noDescription}</p>
                ))}
              {preview.status === "error" && (
                <div className="flex items-start gap-2 text-amber-600 text-sm dark:text-amber-500">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{l.loadFailed}</span>
                </div>
              )}
            </div>

            {renderIntegrations &&
              sections.integrations.length > 0 &&
              renderIntegrations(sections.integrations)}

            <SkillPreviewTaxonomy
              category={sections.category}
              tags={sections.tags}
              labels={l}
            />

            {sections.instructions && (
              <SkillPreviewInstructions
                content={sections.instructions}
                labels={l}
              />
            )}

            <div>
              <button
                type="button"
                onClick={onInstall}
                disabled={installing || installed}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-action font-medium text-action-text text-sm transition-colors hover:bg-action/90",
                  (installing || installed) && "opacity-60",
                  installing && "cursor-wait",
                )}
              >
                {installing ? (
                  <>
                    <InstallStatusIcon status="installing" className="size-4" />
                    {l.installing}
                  </>
                ) : installed ? (
                  <>
                    <InstallStatusIcon status="installed" className="size-4" />
                    {l.installed}
                  </>
                ) : (
                  l.install
                )}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
