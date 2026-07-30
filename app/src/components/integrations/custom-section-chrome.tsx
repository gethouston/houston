import { CatalogSearchField, CatalogShell } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "./section-header";

/**
 * The custom-integrations section's `"section"`-variant header: the classic
 * heading + count + description beside the Add button (the standalone block
 * the global page's non-ready states embed). The `"tab"` variant has no
 * header chrome of its own — it renders through {@link CustomModeShell}.
 */
export function CustomSectionChrome({
  count,
  addButton,
}: {
  count: number;
  addButton: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <SectionHeader title={t("custom.title")} count={count} />
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {t("custom.description")}
        </p>
      </div>
      {addButton}
    </div>
  );
}

/**
 * The Custom MODE's layout (HOU-980 review): the same {@link CatalogShell}
 * grammar as the Composio mode — one controls row (this mode's search + the
 * Add button) over an **Installed** card holding the custom rows — so
 * switching the page-level source toggle swaps like for like. No description
 * line: the toggle names the surface and the Add dialog explains the rest.
 * The caller renders the rows (`children`); with a live query matching
 * nothing it passes `count` 0 and shows its own no-results line under the
 * shell.
 */
export function CustomModeShell({
  query,
  onQueryChange,
  addButton,
  count,
  children,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  addButton: ReactNode;
  /** How many rows currently show (matches while filtering, total at rest). */
  count: number;
  children?: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  return (
    <CatalogShell
      controls={
        <div className="flex items-center gap-2">
          <CatalogSearchField
            value={query}
            onChange={onQueryChange}
            label={t("custom.searchPlaceholder")}
            clearLabel={t("custom.clearSearch")}
            className="flex-1"
          />
          {addButton}
        </div>
      }
      installedTitle={t("home.installedTitle")}
      installedCount={count}
      installed={count > 0 ? children : undefined}
      tabs={[]}
    />
  );
}
