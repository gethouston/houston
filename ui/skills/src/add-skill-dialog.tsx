/**
 * AddSkillDialog — modal to add a skill from a GitHub repo or from scratch.
 * DialogContent is a fixed-size flex column so switching views never resizes;
 * each view owns its own scroll region. (The community marketplace now lives
 * inline as a page section, see SkillMarketplaceSection.)
 */

import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useState } from "react";
import type { RepoViewLabels } from "./add-skill-dialog-repo-labels";
import { RepoView } from "./add-skill-dialog-repo-view";
import type { ScratchViewLabels } from "./add-skill-dialog-scratch-view";
import { ScratchView } from "./add-skill-dialog-scratch-view";
import type { RepoSkill } from "./types";

export interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListFromRepo?: (source: string) => Promise<RepoSkill[]>;
  onInstallFromRepo?: (
    source: string,
    skills: RepoSkill[],
  ) => Promise<string[]>;
  /** Creates a brand new skill from a user-authored title + description +
   *  body. Returns the slug Houston stored it under. */
  onCreateFromScratch?: (input: {
    name: string;
    description: string;
    content: string;
  }) => Promise<string>;
  /** Lowercase set of slugs already installed locally. Used to render
   *  "Already installed" badges and disable repeat install attempts. */
  installedSkillNames?: Set<string>;
  labels?: AddSkillDialogLabels;
}

export interface AddSkillDialogLabels {
  title?: string;
  description?: string;
  repoTab?: string;
  scratchTab?: string;
  repo?: RepoViewLabels;
  scratch?: ScratchViewLabels;
}

type View = "repo" | "scratch";

const DEFAULT_LABELS: Required<Omit<AddSkillDialogLabels, "repo" | "scratch">> =
  {
    title: "Add actions",
    description: "Install reusable procedures for your agent.",
    repoTab: "GitHub",
    scratchTab: "From scratch",
  };

export function AddSkillDialog({
  open,
  onOpenChange,
  onListFromRepo,
  onInstallFromRepo,
  onCreateFromScratch,
  installedSkillNames,
  labels,
}: AddSkillDialogProps) {
  const l = { ...DEFAULT_LABELS, ...labels };

  // Narrowed capability objects — TypeScript can guarantee the callbacks
  // are defined inside each truthy branch without non-null assertions.
  const repoCapability =
    onListFromRepo && onInstallFromRepo
      ? { onListFromRepo, onInstallFromRepo }
      : undefined;
  const scratchCapability = onCreateFromScratch
    ? { onCreateFromScratch }
    : undefined;

  const canInstallFromRepo = !!repoCapability;
  const canCreateFromScratch = !!scratchCapability;
  const tabs: View[] = [];
  if (canInstallFromRepo) tabs.push("repo");
  if (canCreateFromScratch) tabs.push("scratch");
  const showTabs = tabs.length > 1;
  const initialView: View = tabs[0] ?? "scratch";

  const [view, setView] = useState<View>(initialView);
  // Bump on open so the scratch form resets its title / description / body
  // every time the dialog re-opens.
  const [openSeq, setOpenSeq] = useState(0);

  useEffect(() => {
    if (open) setOpenSeq((n) => n + 1);
    if (!open) setView(initialView);
  }, [open, initialView]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl !gap-0 p-0 h-[80vh] max-h-[720px] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>{l.title}</DialogTitle>
          <DialogDescription>{l.description}</DialogDescription>
        </DialogHeader>

        {showTabs && (
          <div className="shrink-0 flex gap-1 px-6 pb-3">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setView(tab)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full transition-colors",
                  view === tab
                    ? "bg-hover text-ink font-medium"
                    : "text-ink-muted hover:bg-hover hover:text-ink",
                )}
              >
                {tab === "repo" ? l.repoTab : l.scratchTab}
              </button>
            ))}
          </div>
        )}

        {view === "repo" && repoCapability && (
          <RepoView
            onList={repoCapability.onListFromRepo}
            onInstall={repoCapability.onInstallFromRepo}
            labels={labels?.repo}
          />
        )}
        {view === "scratch" && scratchCapability && (
          <ScratchView
            onCreate={async (input) => {
              const slug = await scratchCapability.onCreateFromScratch(input);
              onOpenChange(false);
              return slug;
            }}
            installedSkillNames={installedSkillNames}
            labels={labels?.scratch}
            resetKey={openSeq}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
