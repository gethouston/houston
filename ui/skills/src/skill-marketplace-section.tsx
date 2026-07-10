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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PoweredByVercelBadge } from "./powered-by-vercel-badge";
import { classifySkillError } from "./skill-error-kinds";
import { SkillMarketplaceGrid } from "./skill-marketplace-grid";
import {
  DEFAULT_SKILL_MARKETPLACE_SECTION_LABELS,
  type SkillMarketplaceSectionLabels,
} from "./skill-marketplace-section-labels";
import { SkillMarketplaceShelves } from "./skill-marketplace-shelves";
import { CATEGORY_ALL, showsShelves } from "./skill-marketplace-state-model";
import {
  SkillPreviewModal,
  type SkillPreviewState,
} from "./skill-preview-modal";
import type { CommunitySkill, CommunitySkillPreview } from "./types";
import { useSkillMarketplaceShelves } from "./use-skill-marketplace-shelves";
import { useSkillMarketplaceState } from "./use-skill-marketplace-state";

const EMPTY_PREVIEW: CommunitySkillPreview = {
  title: null,
  description: "",
  image: null,
  category: null,
  tags: [],
};

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
  labels?: SkillMarketplaceSectionLabels;
}

export function SkillMarketplaceSection({
  active = true,
  onSearch,
  onInstall,
  onPreview,
  installedSkillNames,
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
  const { query, setQuery, phase, installState, install } =
    useSkillMarketplaceState({
      open: active,
      onSearch,
      onInstall,
      categoryQuery,
    });

  const shelvesData = useSkillMarketplaceShelves({
    open: active,
    shelves: l.shelves,
    onSearch,
  });

  const [detailSkill, setDetailSkill] = useState<CommunitySkill | null>(null);
  const [preview, setPreview] = useState<SkillPreviewState>({
    status: "loading",
  });
  const previewAbortRef = useRef<AbortController | null>(null);

  const openInfo = useCallback(
    (skill: CommunitySkill) => {
      previewAbortRef.current?.abort();
      setDetailSkill(skill);
      if (!onPreview) {
        // No rich-preview fetcher: open a lightweight modal that reads
        // "No description provided" rather than leaving the row click dead.
        setPreview({ status: "loaded", preview: EMPTY_PREVIEW });
        return;
      }
      setPreview({ status: "loading" });
      const controller = new AbortController();
      previewAbortRef.current = controller;
      onPreview(skill, controller.signal)
        .then((p) => {
          if (controller.signal.aborted) return;
          setPreview({ status: "loaded", preview: p });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (classifySkillError(err) === "aborted") return;
          setPreview({ status: "error" });
        });
    },
    [onPreview],
  );

  const closeDetail = useCallback(() => {
    previewAbortRef.current?.abort();
    setDetailSkill(null);
  }, []);

  // Leaving the section abandons any open detail + in-flight preview fetch.
  useEffect(() => {
    if (!active) closeDetail();
  }, [active, closeDetail]);

  const detailSlug = detailSkill
    ? (detailSkill.skillId || detailSkill.name).toLowerCase()
    : null;
  const detailEntry = detailSkill
    ? installState.get(detailSkill.id)
    : undefined;
  const detailInstalled = detailSkill
    ? detailEntry === "installed" ||
      (detailSlug !== null && (installedSkillNames?.has(detailSlug) ?? false))
    : false;

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
      {l.heading && (
        <div className="mb-3">
          <p className="text-sm font-medium text-ink">{l.heading}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
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
        labels={l}
      />

      <SkillPreviewModal
        open={detailSkill !== null}
        onOpenChange={(o) => {
          if (!o) closeDetail();
        }}
        skill={detailSkill}
        preview={preview}
        installing={detailEntry === "installing"}
        installed={detailInstalled}
        onInstall={() => detailSkill && install(detailSkill)}
        labels={l.preview}
      />
    </div>
  );
}
