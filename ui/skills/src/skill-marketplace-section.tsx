/**
 * SkillMarketplaceSection — the Skills.sh marketplace rendered inline as a page
 * section (styled like the app's Integrations tab), not inside a dialog.
 *
 * {@link SkillMarketplaceGrid} renders a control row (search box + category
 * picker), publisher filter chips, and a two-column grid of compact rows; the
 * curated category shelves fill the default browse view. Clicking a row (or its
 * info button) opens {@link SkillPreviewModal} as an OVERLAY over the page,
 * which fetches and shows the skill's real SKILL.md description before install.
 *
 * The search / install state machine lives in `useSkillMarketplaceState`; this
 * component owns the selected category, the detail-modal state (which skill is
 * open), and its on-demand preview fetch.
 */

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { PoweredByVercelBadge } from "./powered-by-vercel-badge";
import { SkillMarketplaceDetail } from "./skill-marketplace-detail";
import { SkillMarketplaceGrid } from "./skill-marketplace-grid";
import {
  DEFAULT_SKILL_MARKETPLACE_SECTION_LABELS,
  type SkillMarketplaceSectionLabels,
} from "./skill-marketplace-section-labels";
import { SkillMarketplaceShelves } from "./skill-marketplace-shelves";
import { CATEGORY_ALL, showsShelves } from "./skill-marketplace-state-model";
import type { CommunitySkill, CommunitySkillPreview } from "./types";
import { useSkillMarketplaceShelves } from "./use-skill-marketplace-shelves";
import { useSkillMarketplaceState } from "./use-skill-marketplace-state";
import { useSkillPreview } from "./use-skill-preview";

export interface SkillMarketplaceSectionProps {
  /** Whether the section is the active page/tab; drives fetch-on-mount and
   *  detail cleanup. Defaults to true (the section mounts with the page). */
  active?: boolean;
  onSearch: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  onInstall: (skill: CommunitySkill, signal?: AbortSignal) => Promise<string>;
  /**
   * Optional on-demand full-description fetcher for the detail modal. When
   * absent the modal still opens (so a row click is never dead) but shows the
   * "no description" state; install still works. When present, a fetch failure
   * transitions to the visible error state, never a silent swallow.
   */
  onPreview?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<CommunitySkillPreview>;
  /** Lowercase set of slugs already installed locally. */
  installedSkillNames?: Set<string>;
  /**
   * Renders the apps a previewed skill connects to, from its frontmatter
   * toolkit slugs. Owned by the consumer because resolving a slug to a real app
   * name + logo is a Composio-catalog concern; without it the detail modal
   * simply omits the section.
   */
  renderIntegrations?: (slugs: string[]) => ReactNode;
  /**
   * Controlled search query. When provided the section renders no search box of
   * its own and mirrors this value, so a page can drive it from one shared
   * field over multiple sections. Omit for the self-contained behavior (the
   * section owns its own search box + query).
   */
  query?: string;
  onQueryChange?: (q: string) => void;
  labels?: SkillMarketplaceSectionLabels;
}

export function SkillMarketplaceSection({
  active = true,
  onSearch,
  onInstall,
  onPreview,
  installedSkillNames,
  renderIntegrations,
  query: controlledQuery,
  onQueryChange,
  labels,
}: SkillMarketplaceSectionProps) {
  const l = { ...DEFAULT_SKILL_MARKETPLACE_SECTION_LABELS, ...labels };

  // The selected category (or "All"). Its own state, not a query-text hack: a
  // selection drives the flat result grid without touching the search box.
  const [category, setCategory] = useState<string>(CATEGORY_ALL);
  useEffect(() => {
    if (!active) setCategory(CATEGORY_ALL);
  }, [active]);

  const categoryOptions = useMemo(
    () => l.shelves.map((s) => ({ value: s.id, label: s.title })),
    [l.shelves],
  );
  const categoryQuery =
    category === CATEGORY_ALL
      ? null
      : (l.shelves.find((s) => s.id === category)?.query ?? null);

  // Search / install flow. An empty search box plus a selected category runs
  // that category's full result list through the same search machinery.
  const controlled = controlledQuery !== undefined;
  const { query, setQuery, phase, installState, install } =
    useSkillMarketplaceState({
      open: active,
      onSearch,
      onInstall,
      categoryQuery,
      query: controlledQuery,
      onQueryChange,
    });

  const shelvesData = useSkillMarketplaceShelves({
    open: active,
    shelves: l.shelves,
    onSearch,
  });

  // The detail modal's open skill + its on-demand preview fetch (abandoned when
  // the section goes inactive) live in the shared hook.
  const { detailSkill, preview, openInfo, closeDetail } = useSkillPreview(
    active,
    onPreview,
  );

  // The browse shelves show only in the default view: nothing typed AND "All
  // categories" selected. A typed query or a picked category swaps in the flat
  // result grid instead. The grid renders `shelvesSlot` whenever it is present.
  const shelvesSlot = showsShelves(query, category) ? (
    <SkillMarketplaceShelves
      shelves={shelvesData.shelves}
      allFailed={shelvesData.allFailed}
      onRetry={shelvesData.retry}
      installState={installState}
      installedSkillNames={installedSkillNames}
      onInstall={install}
      onOpenDetail={openInfo}
      onSeeAll={setCategory}
      labels={{
        seeAll: l.seeAll,
        browseUnavailable: l.browseUnavailable,
        retry: l.retry,
        card: l.card,
      }}
    />
  ) : undefined;

  return (
    <div>
      {(l.heading || l.subheading || l.poweredByVercel) && (
        <div className="mb-3">
          {l.heading && (
            <p className="text-sm font-medium text-ink">{l.heading}</p>
          )}
          <div
            className={`flex flex-wrap items-center gap-x-2 text-xs text-ink-muted${
              l.heading ? " mt-0.5" : ""
            }`}
          >
            {l.subheading && <span>{l.subheading}</span>}
            <PoweredByVercelBadge label={l.poweredByVercel} />
          </div>
        </div>
      )}

      <SkillMarketplaceGrid
        phase={phase}
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        categoryOptions={categoryOptions}
        installState={installState}
        installedSkillNames={installedSkillNames}
        onInstall={install}
        onOpenDetail={openInfo}
        shelvesSlot={shelvesSlot}
        hideSearch={controlled}
        labels={l}
      />

      <SkillMarketplaceDetail
        skill={detailSkill}
        preview={preview}
        installState={installState}
        installedSkillNames={installedSkillNames}
        onInstall={install}
        onClose={closeDetail}
        renderIntegrations={renderIntegrations}
        labels={l.preview}
      />
    </div>
  );
}
