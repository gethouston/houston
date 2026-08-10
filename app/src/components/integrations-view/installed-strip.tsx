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
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type InstalledRow,
  installedPreview,
} from "../../lib/installed-preview";
import {
  AppLogo,
  CustomIntegrationRow,
  type CustomSelection,
} from "../integrations";

/** One installed item, prebuilt as its row node so the preview cap can slice
 *  catalog and custom rows as ONE list in display order. */
interface InstalledItem {
  key: string;
  row: ReactNode;
}

/**
 * The Composio "Installed" section: the user's active catalog connections as
 * the SAME flat rows the browse catalog uses ({@link CatalogRow}: brand art
 * via {@link AppLogo}, name + one-line description, a quiet trailing
 * chevron). Custom integrations follow the active catalog rows in the SAME
 * grid, preserving their key, sign-in, detail, and remove actions. The parent
 * hands us already-filtered rows, so this component stays a pure renderer.
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
  customSelection,
  onCustomSignIn,
  searching = false,
}: {
  active: readonly InstalledRow[];
  custom: readonly CustomIntegrationView[];
  onOpen: (connection: IntegrationConnection) => void;
  customSelection: CustomSelection;
  onCustomSignIn: (slug: string) => void;
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
      row: (
        <CatalogRow
          icon={<AppLogo display={row.app} size="lg" className="rounded-lg" />}
          title={row.app.name}
          description={
            row.accounts && row.accounts.length > 1
              ? accountsSummary(row.accounts)
              : row.app.description
          }
          onClick={() => onOpen(row.connection)}
          statusDot={<StatusDot status="active" srLabel={t("status.active")} />}
          trailing={
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-ink-muted"
            />
          }
        />
      ),
    })),
    ...custom.map((integration) => ({
      key: `custom:${integration.slug}`,
      row: (
        <CustomIntegrationRow
          integration={integration}
          onOpen={(item) => customSelection.openDetail(item.slug)}
          onEnterKey={(item) => customSelection.openKey(item.slug)}
          onSignIn={(item) => onCustomSignIn(item.slug)}
          onRemove={(item) => customSelection.openRemove(item.slug)}
        />
      ),
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
          <Fragment key={item.key}>{item.row}</Fragment>
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
