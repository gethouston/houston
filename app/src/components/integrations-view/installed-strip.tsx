import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
  StatusDot,
} from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type InstalledRow,
  installedPreview,
} from "../../lib/installed-preview";
import { AppLogo } from "../integrations";

/** One installed item, flattened to the props {@link CatalogRow} needs so the
 *  preview cap can slice the list in display order. */
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
 * The Composio "Installed" section: the user's active catalog connections as
 * the SAME flat rows the browse catalog uses ({@link CatalogRow}: brand art
 * via {@link AppLogo}, name + one-line description, a quiet trailing
 * chevron). Custom integrations never appear here — since the mode split
 * (HOU-980 review) they live behind their own page-level mode with their own
 * installed list. The parent hands us already-filtered rows, so this
 * component stays a pure renderer; a row opens that connection's detail
 * modal.
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
  onOpen,
  searching = false,
}: {
  active: readonly InstalledRow[];
  onOpen: (connection: IntegrationConnection) => void;
  /** True while the surface's shared query or category is narrowing the rows:
   *  show every match uncapped. At rest (the default) the section caps to a
   *  preview. */
  searching?: boolean;
}) {
  const { t } = useTranslation("integrations");
  const [expanded, setExpanded] = useState(false);

  // An app holding several accounts says so on its one line — the labels the
  // provider knows (emails, workspaces) beat the generic app blurb there.
  const accountsSummary = (accounts: readonly { accountLabel?: string }[]) => {
    const labels = accounts.flatMap((a) =>
      a.accountLabel ? [a.accountLabel] : [],
    );
    const count = t("accounts.count", { count: accounts.length });
    return labels.length > 0 ? `${count} · ${labels.join(", ")}` : count;
  };

  const items: InstalledItem[] = [
    ...active.map((row) => ({
      key: row.connection.connectionId,
      icon: <AppLogo display={row.app} size="lg" className="rounded-lg" />,
      title: row.app.name,
      description:
        row.accounts && row.accounts.length > 1
          ? accountsSummary(row.accounts)
          : row.app.description,
      // Every catalog row here IS active — both callers keep pending and
      // errored connections in the catalog (on the app's own row, wearing its
      // status), so the dot is green by construction rather than by a status
      // lookup that could never resolve to anything else.
      statusDot: <StatusDot status="active" srLabel={t("status.active")} />,
      onClick: () => onOpen(row.connection),
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
