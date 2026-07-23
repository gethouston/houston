import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
  StatusDot,
} from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { installedPreview } from "../../lib/installed-preview";
import {
  providerCostLine,
  providerDescription,
} from "../../lib/provider-overrides";
import type { ProviderInfo } from "../../lib/providers";
import { BrandMark } from "../provider-browser/brand-mark";

/**
 * The hub's consolidated "Connected" strip in the catalog ROW grammar the
 * browse lists use: every connected AI provider as a flat {@link CatalogRow} —
 * the full-color {@link BrandMark}, the provider name, and one muted line
 * naming how it is connected (its cost/account prose, e.g. "Your Claude
 * subscription", falling back to the provider's niche), and a quiet trailing
 * chevron marking the row as an open-affordance (same grammar as the installed
 * integrations/skills strips). The row BODY opens that provider's detail modal
 * (sign-out and its model list live there). It sits OUTSIDE the discovery tabs
 * (identity, not discovery).
 *
 * The page's ONE search field narrows this strip: the parent passes the already
 * matched `providers` (and omits the whole section when a live query matches
 * none), so the strip is a pure renderer. At rest it shows at most
 * {@link CATALOG_INSTALLED_PREVIEW_CAP} rows behind a "Show all" expander so a
 * well-stocked strip never buries the tabs; while `searching` every match shows
 * uncapped (searching IS looking past the preview).
 */
export function ConnectedProvidersStrip({
  providers,
  searching,
  onOpen,
}: {
  /** The connected providers to render — already narrowed by the page query. */
  providers: readonly ProviderInfo[];
  /** Whether the page query is active (uncaps the preview). */
  searching: boolean;
  onOpen: (provider: ProviderInfo) => void;
}) {
  const { t } = useTranslation("aiHub");
  const [expanded, setExpanded] = useState(false);

  // A live query shows every match; at rest the strip caps its rows so a full
  // strip never pushes the discovery tabs below the fold.
  const { visible: rows, showExpander } = installedPreview(providers, {
    searching,
    expanded,
    cap: CATALOG_INSTALLED_PREVIEW_CAP,
  });

  return (
    <div>
      <CatalogGrid>
        {rows.map((provider) => {
          const description =
            providerCostLine(provider.id) ?? providerDescription(provider.id);
          return (
            <CatalogRow
              key={provider.id}
              icon={<BrandMark providerId={provider.id} size="lg" />}
              title={provider.name}
              description={description || undefined}
              onClick={() => onOpen(provider)}
              statusDot={
                <StatusDot status="active" srLabel={t("card.connected")} />
              }
              trailing={
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-ink-muted"
                />
              }
            />
          );
        })}
      </CatalogGrid>
      {showExpander && (
        <CatalogShowMore onClick={() => setExpanded(true)}>
          {t("search.showAll", { count: providers.length })}
        </CatalogShowMore>
      )}
    </div>
  );
}
