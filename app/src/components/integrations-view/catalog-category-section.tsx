import type { IntegrationToolkit } from "@houston/engine-adapter";
import { CatalogGrid, CatalogShowMore } from "@houston-ai/core";
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

export interface VisibleSection {
  category: string;
  total: number;
  rows: IntegrationToolkit[];
  hasMore: boolean;
}

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
  surface: string;
  connectFlow: ConnectFlow;
  onConnect: (toolkit: string, origin: string) => void;
  owns: (slug: string, origin: string) => boolean;
  statusOf: (slug: string) => BrokenStatus | undefined;
  onOpen: (toolkit: IntegrationToolkit, origin: string) => void;
  onExpand: (category: string) => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <section>
      <SectionHeader
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
