import type {
  CustomIntegrationView,
  IntegrationConnection,
} from "@houston/engine-adapter";
import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
  StatusDot,
} from "@houston-ai/core";
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

interface InstalledItem {
  key: string;
  row: ReactNode;
}

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
  searching?: boolean;
}) {
  const { t } = useTranslation("integrations");
  const [expanded, setExpanded] = useState(false);

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
