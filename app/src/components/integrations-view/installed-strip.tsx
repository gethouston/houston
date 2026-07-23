import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
  StatusDot,
} from "@houston-ai/core";
import type {
  CustomIntegrationView,
  IntegrationConnection,
} from "@houston-ai/engine-client";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type InstalledRow,
  installedPreview,
} from "../../lib/installed-preview";
import { AppLogo } from "../integrations";

/** One installed item, flattened to the props {@link CatalogRow} needs so the
 *  preview cap can slice a single list spanning both active apps and custom
 *  integrations in display order. */
interface InstalledItem {
  key: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** The presence-style status dot left of the name ("● Asana"), so connected /
   *  pending / error reads without opening the row. */
  statusDot: ReactNode;
  onClick: () => void;
}

/**
 * The CONSOLIDATED "Installed" section: everything the user already has — active
 * catalog connections AND custom integrations — as the SAME flat rows the
 * browse catalog uses ({@link CatalogRow}: brand art via {@link AppLogo}, name +
 * one-line description, a quiet trailing chevron). It sits above the source tabs
 * (identity, not discovery), so it never changes when the user switches tabs,
 * and the tabs' own searches never touch it. The parent may narrow WHICH rows
 * render via the section's own "Installed" search — it hands us the already-
 * filtered rows, so this component stays a pure renderer. A catalog row opens
 * that connection's detail modal; a custom row jumps to the Custom integrations
 * tab, where its row (status, key, remove) lives.
 *
 * At rest the section caps to {@link CATALOG_INSTALLED_PREVIEW_CAP} rows behind
 * a quiet "Show all N" expander, so a well-stocked section never buries the
 * discovery tabs; while the surface's shared query or category filter is active
 * (`searching`) every match renders uncapped — filtering IS the act of looking
 * past the preview. The parent omits the whole section (heading included) when
 * the filter leaves nothing installed, so this component always has rows to
 * render.
 */
export function InstalledStrip({
  active,
  custom,
  onOpen,
  onOpenCustom,
  searching = false,
}: {
  active: readonly InstalledRow[];
  custom: CustomIntegrationView[];
  onOpen: (connection: IntegrationConnection) => void;
  onOpenCustom: (integration: CustomIntegrationView) => void;
  /** True while the surface's shared query or category is narrowing the rows:
   *  show every match uncapped. At rest (the default) the section caps to a
   *  preview. */
  searching?: boolean;
}) {
  const { t } = useTranslation("integrations");
  const [expanded, setExpanded] = useState(false);

  const items: InstalledItem[] = [
    ...active.map((row) => ({
      key: row.connection.connectionId,
      icon: <AppLogo display={row.app} size="lg" className="rounded-lg" />,
      title: row.app.name,
      description: row.app.description,
      statusDot: (
        <StatusDot
          status={row.connection.status}
          srLabel={t(`status.${row.connection.status}`)}
        />
      ),
      onClick: () => onOpen(row.connection),
    })),
    ...custom.map((integration) => ({
      key: integration.slug,
      icon: (
        <AppLogo
          display={{
            toolkit: integration.slug,
            name: integration.name,
            description: "",
            logoUrl: "",
          }}
          size="lg"
          className="rounded-lg"
        />
      ),
      title: integration.name,
      description: t(
        integration.kind === "mcp" ? "custom.badge.mcp" : "custom.badge.api",
      ),
      statusDot: (
        <StatusDot
          status={integration.state.status}
          srLabel={t(`status.${integration.state.status}`)}
        />
      ),
      onClick: () => onOpenCustom(integration),
    })),
  ];

  const { visible, showExpander } = installedPreview(items, {
    searching,
    expanded,
    cap: CATALOG_INSTALLED_PREVIEW_CAP,
  });

  return (
    <div>
      <CatalogGrid>
        {visible.map((item) => (
          <CatalogRow
            key={item.key}
            icon={item.icon}
            title={item.title}
            description={item.description}
            onClick={item.onClick}
            statusDot={item.statusDot}
            trailing={
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-ink-muted"
              />
            }
          />
        ))}
      </CatalogGrid>
      {showExpander && (
        <CatalogShowMore onClick={() => setExpanded(true)}>
          {t("home.showAllApps", { count: items.length })}
        </CatalogShowMore>
      )}
    </div>
  );
}

/** A row placeholder while the connections settle. Mirrors the installed row
 *  shape (a two-column grid of icon + two text lines). Decorative only. */
export function InstalledSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-1 lg:grid-cols-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="size-10 shrink-0 animate-pulse rounded-lg bg-chip" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-24 animate-pulse rounded bg-chip" />
            <div className="h-3 w-36 animate-pulse rounded bg-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}
