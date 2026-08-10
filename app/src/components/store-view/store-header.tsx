import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import { ChevronRight, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import { PageHeaderBackChip } from "../shell/page-header/page-header-back-chip";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import {
  type PageHeaderTabItem,
  PageHeaderTabs,
} from "../shell/page-header/page-header-tabs";

export type StorePane = "browse" | "my-agents";

/**
 * Browse is the limiting case: its tools ride the strip. The left cluster is
 * ~210px (Agent Store 130 + Profile 75 + their 2px gap); the strip-variant
 * controls are ~556px (search 224 + category 150 + view 110 + sort 48 + three
 * 8px gaps); the frame's px-5 is 40px and the zone gap 12. `210 + 556 + 40 +
 * 12 = 818`, rounded UP to 840. No compact middle mode: the controls have no
 * shorter honest form, so below this they stack. The drilled panes render no
 * tools, so the threshold changes nothing for them — a chip plus one lozenge
 * simply truncates.
 */
export const STORE_HEADER_THRESHOLDS: HeaderThresholds = { oneRowMin: 840 };

/**
 * The store strip on both levels, one navigation grammar with the rest of the
 * app:
 *
 *     (🏪 Agent Store)(Profile)                 — browsing / your profile
 *     (‹ 🏪 Agent Store) (@maria)               — a creator's page
 *     (‹ 🏪 Agent Store) (@maria › Site Builder) — an agent's page
 *
 * **A drilled place is ONE lozenge, growing segments.** An agent belongs to
 * its creator the way a pinned agent belongs to its team, and it borrows the
 * team lozenge's answer (`team-chrome.tsx`): chevron-joined segments inside a
 * single lozenge, never a second lozenge beside the first. Clicking it goes
 * up one segment — the agent's lozenge opens its creator — mirroring how the
 * team lozenge sheds its pinned agent.
 *
 * **The owner segment always shows.** A listing always names its creator, so
 * an agent's lozenge never appears ownerless: `@handle` when the creator has
 * one (a page exists, the click goes there), the plain display name when they
 * never claimed one (no page, the click has nowhere up to go). A row reached
 * through a creator's page may arrive without its own enrichment, so the
 * handle falls back to the page it was opened from.
 *
 * Per the drilled-header rules on {@link PageHeaderBackChip}, the drilled
 * lozenge is text-only; the Store glyph rides only the top-level identity and
 * the back chip.
 */
export function StoreHeader({
  pane,
  detailAgent,
  creatorHandle,
  onBrowse,
  onMyAgents,
  onOpenCreator,
}: {
  pane: StorePane;
  detailAgent: StoreCatalogAgent | null;
  creatorHandle: string | null;
  onBrowse: () => void;
  onMyAgents: () => void;
  onOpenCreator: (handle: string) => void;
}) {
  const { t } = useTranslation("store");

  if (!detailAgent && !creatorHandle) {
    const items: PageHeaderTabItem<StorePane>[] = [
      {
        id: "browse",
        heading: true,
        label: (
          <>
            <Store aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{t("title")}</span>
          </>
        ),
      },
      { id: "my-agents", label: t("header.profile") },
    ];
    return (
      <PageHeader>
        <PageHeaderTabs
          items={items}
          active={pane}
          label={t("header.tabsLabel")}
          onSelect={(next) => (next === "browse" ? onBrowse() : onMyAgents())}
        />
      </PageHeader>
    );
  }

  const handle = detailAgent
    ? (detailAgent.creator.handle ?? creatorHandle)
    : creatorHandle;
  const owner = handle ? `@${handle}` : detailAgent?.creator.displayName;
  const place = (
    <>
      {owner && <span className="min-w-0 truncate">{owner}</span>}
      {detailAgent && (
        <>
          {owner && (
            <ChevronRight
              aria-hidden
              className="size-3.5 shrink-0 opacity-60"
            />
          )}
          <span className="min-w-0 truncate">{detailAgent.name}</span>
        </>
      )}
    </>
  );
  const up = () => {
    if (detailAgent && handle) onOpenCreator(handle);
  };

  return (
    <PageHeader>
      <div className="flex min-w-0 items-center gap-2">
        <PageHeaderBackChip
          label={t("title")}
          icon={<Store aria-hidden className="size-4 shrink-0" />}
          onClick={onBrowse}
        />
        <PageHeaderTabs
          items={[{ id: "place", heading: true, label: place }]}
          active="place"
          label={t("header.tabsLabel")}
          onSelect={up}
        />
      </div>
    </PageHeader>
  );
}
