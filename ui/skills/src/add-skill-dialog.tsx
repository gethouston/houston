/**
 * AddSkillDialog — Marketplace modal with two tabs (Skills.sh / GitHub).
 *
 * Layout rules:
 * - DialogContent is a fixed-size flex column. Switching tabs never resizes.
 * - Header + pill row are fixed. Body is the only scrollable region.
 */
import { useEffect, useState } from "react";
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { CommunitySkill, RepoSkill } from "./types";
import { StoreView } from "./add-skill-dialog-store-view";
import type { StoreViewLabels } from "./add-skill-dialog-store-labels";
import { RepoView } from "./add-skill-dialog-repo-view";
import type { RepoViewLabels } from "./add-skill-dialog-repo-labels";
import { ScratchView } from "./add-skill-dialog-scratch-view";
import type { ScratchViewLabels } from "./add-skill-dialog-scratch-view";

export interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Community marketplace search. Omit to hide the marketplace tab
   *  entirely — the dialog then offers only the create-from-scratch
   *  (and, when wired, the GitHub repo) views. */
  onSearch?: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  /** Optional dedicated "popular skills" fetcher for the dialog empty state. */
  onPopular?: (signal?: AbortSignal) => Promise<CommunitySkill[]>;
  /** Install a marketplace skill. Required to surface the marketplace tab. */
  onInstallCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<string>;
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
  storeTab?: string;
  repoTab?: string;
  scratchTab?: string;
  store?: StoreViewLabels;
  repo?: RepoViewLabels;
  scratch?: ScratchViewLabels;
}

type View = "store" | "repo" | "scratch";

const DEFAULT_LABELS: Required<
  Omit<AddSkillDialogLabels, "store" | "repo" | "scratch">
> = {
  title: "Add actions",
  description: "Install reusable procedures for your agent.",
  storeTab: "Skills.sh",
  repoTab: "GitHub",
  scratchTab: "From scratch",
};

export function AddSkillDialog({
  open,
  onOpenChange,
  onSearch,
  onPopular,
  onInstallCommunity,
  onListFromRepo,
  onInstallFromRepo,
  onCreateFromScratch,
  installedSkillNames,
  labels,
}: AddSkillDialogProps) {
  const l = { ...DEFAULT_LABELS, ...labels };

  const canBrowseStore = !!onSearch && !!onInstallCommunity;
  const canInstallFromRepo = !!onListFromRepo && !!onInstallFromRepo;
  const canCreateFromScratch = !!onCreateFromScratch;
  const tabs: View[] = [];
  if (canBrowseStore) tabs.push("store");
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
      <DialogContent className="sm:max-w-lg !gap-0 p-0 h-[600px] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>{l.title}</DialogTitle>
          <DialogDescription>{l.description}</DialogDescription>
        </DialogHeader>

        {showTabs && (
          <div className="shrink-0 flex gap-1 px-6 pb-3">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full transition-colors",
                  view === tab
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tab === "store"
                  ? l.storeTab
                  : tab === "repo"
                    ? l.repoTab
                    : l.scratchTab}
              </button>
            ))}
          </div>
        )}

        {view === "store" && canBrowseStore && (
          <StoreView
            open={open}
            onSearch={onSearch!}
            onPopular={onPopular}
            onInstall={onInstallCommunity!}
            installedSkillNames={installedSkillNames}
            labels={labels?.store}
          />
        )}
        {view === "repo" && canInstallFromRepo && (
          <RepoView
            onList={onListFromRepo!}
            onInstall={onInstallFromRepo!}
            labels={labels?.repo}
          />
        )}
        {view === "scratch" && canCreateFromScratch && (
          <ScratchView
            onCreate={async (input) => {
              const slug = await onCreateFromScratch!(input);
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
