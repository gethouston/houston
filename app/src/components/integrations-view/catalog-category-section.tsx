import { CatalogGrid, CatalogShowMore } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import {
  appDisplay,
  type BrokenStatus,
  type ConnectFlow,
  categoryLabel,
  connectOriginKey,
  MOST_USED,
  SectionHeader,
  UNCATEGORIZED,
} from "../integrations";
import { PlaneAppRow } from "./plane-app-row";

/** One browse section as it is actually rendered: the rows that survived this
 *  section's preview cap, plus the totals the header and expander quote. */
export interface VisibleSection {
  category: string;
  /** Every connectable app in the section, cap or no cap (the header's count). */
  total: number;
  /** The rows on screen right now. */
  rows: IntegrationToolkit[];
  /** The cap is hiding some: render the expander. */
  hasMore: boolean;
}

/**
 * ONE category section of the browse plane: its header, its capped grid of
 * {@link PlaneAppRow}s, and the "Show all N" expander when the cap is biting.
 *
 * Rows are addressed by ORIGIN, not by slug: the same app can render in two
 * sections at once (the curated "Most used" spotlight repeats category rows), so
 * `owns` decides which single copy shows the inline connect state and `onOpen`
 * carries the pressed row's origin into the info modal — connecting from there
 * lands the state on the row the user actually opened.
 *
 * `statusOf` answers with a pending / errored connection's status for the apps
 * that hold one: those rows wear it instead of their blurb and stay right here,
 * duplicates included, like any other app in the section.
 */
export function CatalogCategorySection({
  section,
  surface,
  connectFlow,
  onConnect,
  owns,
  statusOf,
  onOpen,
  onExpand,
}: {
  section: VisibleSection;
  /** This catalog's half of every row's origin key. */
  surface: string;
  connectFlow: ConnectFlow;
  onConnect: (toolkit: string, origin: string) => void;
  /** Does THIS row own its app's inline connect state? */
  owns: (slug: string, origin: string) => boolean;
  /** This app's broken-connection status, if it has one. */
  statusOf: (slug: string) => BrokenStatus | undefined;
  onOpen: (toolkit: IntegrationToolkit, origin: string) => void;
  onExpand: (category: string) => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <section>
      <SectionHeader
        // <h3>: nested under the Available section's lg <h2> heading.
        as="h3"
        title={
          section.category === MOST_USED
            ? t("home.mostUsed")
            : section.category === UNCATEGORIZED
              ? t("home.otherCategory")
              : categoryLabel(section.category)
        }
        count={section.total}
        className="mb-3"
      />
      <CatalogGrid>
        {section.rows.map((tk) => {
          const origin = connectOriginKey(surface, section.category, tk.slug);
          return (
            <PlaneAppRow
              key={tk.slug}
              display={appDisplay(tk.slug, tk)}
              onOpen={() => onOpen(tk, origin)}
              onConnect={() => onConnect(tk.slug, origin)}
              connectFlow={connectFlow}
              owns={owns(tk.slug, origin)}
              status={statusOf(tk.slug)}
            />
          );
        })}
      </CatalogGrid>
      {section.hasMore && (
        <CatalogShowMore onClick={() => onExpand(section.category)}>
          {t("home.showAllApps", { count: section.total })}
        </CatalogShowMore>
      )}
    </section>
  );
}
