import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { AlertCircle } from "lucide-react";
import { InstallStatusIcon } from "./install-status-icon";
import {
  SkillDescription,
  type SkillDescriptionLabels,
} from "./skill-description";
import {
  formatInstalls,
  kebabToTitle,
  ownerOf,
  repoOf,
} from "./skill-marketplace-util";
import { SkillOwnerAvatar } from "./skill-owner-avatar";
import type { CommunitySkill, CommunitySkillPreview } from "./types";

export type SkillPreviewState =
  | { status: "loading" }
  | { status: "loaded"; preview: CommunitySkillPreview }
  | { status: "error" };

export interface SkillPreviewSheetLabels {
  install?: string;
  installing?: string;
  installed?: string;
  loadFailed?: string;
  noDescription?: string;
  bySource?: (owner: string, repo: string) => string;
  installsCount?: (count: number, formatted: string) => string;
  tagsHeading?: string;
  description?: SkillDescriptionLabels;
}

export interface SkillPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: CommunitySkill | null;
  preview: SkillPreviewState;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  labels?: SkillPreviewSheetLabels;
}

const DEFAULT_LABELS: Required<SkillPreviewSheetLabels> = {
  install: "Install",
  installing: "Installing...",
  installed: "Installed",
  loadFailed: "Couldn't load the full description. You can still install.",
  noDescription: "No description provided.",
  bySource: (owner, repo) => `by ${owner} · ${repo}`,
  installsCount: (count, formatted) =>
    count === 1 ? `${formatted} install` : `${formatted} installs`,
  tagsHeading: "Tags",
  description: {},
};

/**
 * SkillPreviewModal — the overlay detail modal for a marketplace skill,
 * replacing the old in-dialog body-swap sheet. It shows the owner avatar +
 * title + source, then the skill's plain-text SKILL.md description (loading
 * skeletons, then the parsed description or a "no description" note), any tags,
 * and a full-width install button. Install stays enabled even when the
 * description fetch fails, so a load error never blocks installing.
 */
export function SkillPreviewModal({
  open,
  onOpenChange,
  skill,
  preview,
  installing,
  installed,
  onInstall,
  labels,
}: SkillPreviewModalProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const owner = skill ? ownerOf(skill.source) : "";
  const repo = skill ? repoOf(skill.source) : "";
  const title = skill
    ? preview.status === "loaded" && preview.preview.title
      ? preview.preview.title
      : kebabToTitle(skill.skillId || skill.name)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
                    <p className="truncate text-xs text-muted-foreground">
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
                  <div className="animate-pulse bg-secondary rounded h-3 w-full" />
                  <div className="animate-pulse bg-secondary rounded h-3 w-11/12" />
                  <div className="animate-pulse bg-secondary rounded h-3 w-2/3" />
                </div>
              )}
              {preview.status === "loaded" &&
                (preview.preview.description ? (
                  <SkillDescription
                    description={preview.preview.description}
                    labels={l.description}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {l.noDescription}
                  </p>
                ))}
              {preview.status === "error" && (
                <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-500">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{l.loadFailed}</span>
                </div>
              )}
            </div>

            {preview.status === "loaded" && preview.preview.tags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {l.tagsHeading}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.preview.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={onInstall}
                disabled={installing || installed}
                className={cn(
                  "w-full h-11 flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors",
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
