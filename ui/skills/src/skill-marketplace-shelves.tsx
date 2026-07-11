/**
 * SkillMarketplaceShelves: the app-store-style browse view for the marketplace
 * default state. Renders the curated category shelves, each a header row (title
 * + a "See all" that selects the category in the picker) above a capped 2-column
 * mini-grid of {@link SkillMarketplaceRow}s. Purely presentational: it owns no
 * fetching (see `use-skill-marketplace-shelves.ts`). A shelf shows skeletons
 * while loading and is hidden on error; when every shelf fails the whole view
 * degrades to the shared retryable fallback.
 */

import { BrowseErrorNotice } from "./skill-marketplace-grid-parts";
import type { SkillMarketplaceCardLabels } from "./skill-marketplace-row";
import { SkillMarketplaceRow } from "./skill-marketplace-row";
import {
  capShelfSkills,
  isShelfVisible,
  type ResolvedShelf,
  SHELF_GRID_CAP,
} from "./skill-marketplace-shelves-model";
import type { CommunitySkill } from "./types";

const SKELETON_KEYS = ["a", "b", "c", "d"];

export interface SkillMarketplaceShelvesLabels {
  seeAll: string;
  /** The all-shelves-failed fallback message. */
  browseUnavailable: string;
  retry: string;
  card?: SkillMarketplaceCardLabels;
}

export interface SkillMarketplaceShelvesProps {
  shelves: ResolvedShelf[];
  allFailed: boolean;
  onRetry: () => void;
  installState: Map<string, "installing" | "installed" | "failed">;
  installedSkillNames?: Set<string>;
  onInstall: (skill: CommunitySkill) => void;
  onOpenDetail: (skill: CommunitySkill) => void;
  /** "See all" selects the shelf's category (by id) in the picker. */
  onSeeAll: (shelfId: string) => void;
  labels: SkillMarketplaceShelvesLabels;
}

function ShelfSkeletonRow() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {SKELETON_KEYS.map((k) => (
        <div key={k} className="h-14 animate-pulse rounded-xl bg-secondary" />
      ))}
    </div>
  );
}

function ShelfCardRow({
  skills,
  installState,
  installedSkillNames,
  onInstall,
  onOpenDetail,
  cardLabels,
}: {
  skills: CommunitySkill[];
  installState: Map<string, "installing" | "installed" | "failed">;
  installedSkillNames?: Set<string>;
  onInstall: (skill: CommunitySkill) => void;
  onOpenDetail: (skill: CommunitySkill) => void;
  cardLabels?: SkillMarketplaceCardLabels;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {capShelfSkills(skills, SHELF_GRID_CAP).map((skill) => {
        const slug = (skill.skillId || skill.name).toLowerCase();
        const installed =
          installState.get(skill.id) === "installed" ||
          (installedSkillNames?.has(slug) ?? false);
        return (
          <SkillMarketplaceRow
            key={skill.id}
            skill={skill}
            installing={installState.get(skill.id) === "installing"}
            installed={installed}
            onInstall={() => onInstall(skill)}
            onOpenInfo={() => onOpenDetail(skill)}
            labels={cardLabels}
          />
        );
      })}
    </div>
  );
}

export function SkillMarketplaceShelves({
  shelves,
  allFailed,
  onRetry,
  installState,
  installedSkillNames,
  onInstall,
  onOpenDetail,
  onSeeAll,
  labels,
}: SkillMarketplaceShelvesProps) {
  if (allFailed) {
    return (
      <BrowseErrorNotice
        message={labels.browseUnavailable}
        retryLabel={labels.retry}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {shelves
        .filter((shelf) => isShelfVisible(shelf.state))
        .map((shelf) => (
          <section key={shelf.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {shelf.title}
              </p>
              <button
                type="button"
                onClick={() => onSeeAll(shelf.id)}
                className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {labels.seeAll}
              </button>
            </div>
            {shelf.state.status === "ready" ? (
              <ShelfCardRow
                skills={shelf.state.skills}
                installState={installState}
                installedSkillNames={installedSkillNames}
                onInstall={onInstall}
                onOpenDetail={onOpenDetail}
                cardLabels={labels.card}
              />
            ) : (
              <ShelfSkeletonRow />
            )}
          </section>
        ))}
    </div>
  );
}
