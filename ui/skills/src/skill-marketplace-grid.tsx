/**
 * SkillMarketplaceGrid: the presentational candy-store grid for the Skills.sh
 * marketplace. Purely driven by the `phase` prop: it owns NO data-fetching, no
 * debounce, and no AbortController. A control row (search box `flex-1` + the
 * category picker trailing, the Integrations `AppCatalogGrid` layout) sits above
 * publisher filter chips and a two-column card grid. The "Powered by Vercel"
 * attribution lives in the section header (see `SkillMarketplaceSection`), not
 * here. The search state machine lives upstream (see
 * `use-skill-marketplace-state.ts` + `skill-marketplace-state-model.ts`); this
 * is just its render layer. Render parts
 * (chips, skeleton, body renderer, label defaults) live in
 * `skill-marketplace-grid-parts.tsx` to keep this file under the line limit.
 */

import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type SkillCategoryOption,
  SkillCategorySelect,
} from "./skill-category-select";
// Pure model (JSX-free, so its topPublishers stays node:test-friendly);
// topPublishers is re-exported below so consumers import it from the grid.
import {
  phaseSignature,
  resolveLabels,
  topPublishers,
  visibleSkillsOf,
} from "./skill-marketplace-grid-model";
import {
  MarketplaceBody,
  PublisherChips,
} from "./skill-marketplace-grid-parts";
import type { SkillMarketplaceCardLabels } from "./skill-marketplace-row";
import { ownerOf } from "./skill-marketplace-util";
import type { CommunitySkill } from "./types";

export { topPublishers };

export type SkillMarketplacePhase =
  | { kind: "idle" }
  | { kind: "too-short" }
  | { kind: "searching"; previous: CommunitySkill[] }
  | { kind: "results"; skills: CommunitySkill[]; query: string }
  | { kind: "no-results"; query: string }
  | {
      kind: "search-error";
      reason: "rate_limited" | "offline" | "generic";
      query: string;
    };

export interface SkillMarketplaceGridLabels {
  searchPlaceholder?: string;
  publisherAllLabel?: string;
  /** Default row + trigger label of the category picker. */
  allCategories?: string;
  /** Accessible name for the category picker trigger. */
  categoryAria?: string;
  noResults?: (query: string) => string;
  searchRateLimited?: string;
  searchOffline?: string;
  searchGeneric?: string;
  typeToSearch?: string;
  minQuery?: string;
  card?: SkillMarketplaceCardLabels;
}

export interface SkillMarketplaceGridProps {
  phase: SkillMarketplacePhase;
  query: string;
  onQueryChange: (q: string) => void;
  /** Selected category value (`CATEGORY_ALL` for the default), owned upstream. */
  category: string;
  onCategoryChange: (next: string) => void;
  /** Category picker entries (localized), shown only when non-empty. */
  categoryOptions: SkillCategoryOption[];
  installState: Map<string, "installing" | "installed" | "failed">;
  installedSkillNames?: Set<string>;
  onInstall: (skill: CommunitySkill) => void;
  onOpenDetail: (skill: CommunitySkill) => void;
  /**
   * Optional browse view (curated category shelves) for the default state. When
   * provided (the section passes it only while "All categories" is selected and
   * the search box is empty) it replaces the results body and publisher chips;
   * typing a query or picking a category hands back to the search grid.
   */
  shelvesSlot?: ReactNode;
  labels?: SkillMarketplaceGridLabels;
}

export function SkillMarketplaceGrid({
  phase,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  categoryOptions,
  installState,
  installedSkillNames,
  onInstall,
  onOpenDetail,
  shelvesSlot,
  labels,
}: SkillMarketplaceGridProps) {
  const l = resolveLabels(labels);
  const visible = visibleSkillsOf(phase);
  const publishers = topPublishers(visible);

  // Reset the publisher filter at render time (never via useEffect) whenever the
  // underlying query/results identity changes, so a stale filter can't hide a
  // fresh result set.
  const sig = phaseSignature(phase);
  const [lastSig, setLastSig] = useState(sig);
  const [selected, setSelected] = useState<string | null>(null);
  if (lastSig !== sig) {
    setLastSig(sig);
    setSelected(null);
  }

  const filtered = selected
    ? visible.filter((s) => ownerOf(s.source) === selected)
    : visible;

  // The section hands in `shelvesSlot` only for the default browse view (empty
  // search box AND "All categories" selected); otherwise the results body +
  // publisher chips (search-mode only) take over.
  const browsing = shelvesSlot != null;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={l.searchPlaceholder}
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        {categoryOptions.length > 0 && (
          <SkillCategorySelect
            options={categoryOptions}
            value={category}
            onChange={onCategoryChange}
            labels={{
              allCategories: l.allCategories,
              ariaLabel: l.categoryAria,
            }}
          />
        )}
      </div>

      {browsing ? (
        shelvesSlot
      ) : (
        <>
          {publishers.length > 0 && (
            <PublisherChips
              publishers={publishers}
              selected={selected}
              allLabel={l.publisherAllLabel}
              onSelect={setSelected}
            />
          )}

          <MarketplaceBody
            phase={phase}
            filtered={filtered}
            labels={l}
            installState={installState}
            installedSkillNames={installedSkillNames}
            onInstall={onInstall}
            onOpenDetail={onOpenDetail}
          />
        </>
      )}
    </div>
  );
}
