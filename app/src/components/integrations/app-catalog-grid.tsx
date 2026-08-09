import { CatalogSearchField, Spinner } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilterCombobox } from "../shell/filter-combobox.tsx";
import { type AppDisplay, appDisplay } from "./app-display";
import { AppRow } from "./app-row";
import {
  BROWSE_PAGE_SIZE,
  browseCatalog,
  categoriesOf,
  categoryLabel,
} from "./browse-model";

/** What one app row contributes: its trailing control + optional row click. */
export interface AppCatalogRow {
  trailing: ReactNode;
  onClick?: () => void;
}

interface AppCatalogGridProps {
  catalog: IntegrationToolkit[];
  /**
   * The selected category slug, or `"all"`. Controlled by the surface so ONE
   * category picker filters every list on it (this grid + the connected /
   * allowed lists beside it), not just the browse grid.
   */
  category: string;
  onCategoryChange: (next: string) => void;
  /** Apps to hide entirely (e.g. already-connected in the connect flow). */
  excludeToolkits?: ReadonlySet<string>;
  /** The catalog is still fetching (show a loader, not a "no apps" message). */
  loading?: boolean;
  /** Per-app trailing control (+ optional row click). Owns the row's action. */
  renderRow: (app: AppDisplay, toolkit: IntegrationToolkit) => AppCatalogRow;
}

/**
 * The shared app-catalog shell: a control row (search box `flex-1` + the shared
 * {@link FilterCombobox} category picker trailing) above a paginated two-column
 * {@link AppRow} grid + load-more over the ~1000-app catalog. The per-row action
 * (allow toggle, ...) is delegated via `renderRow`, so a surface picking apps out
 * of the catalog gets this layout without duplicating the shell markup. Category
 * is controlled by the surface so the same selection also filters the lists that
 * sit beside this grid.
 */
export function AppCatalogGrid({
  catalog,
  category,
  onCategoryChange,
  excludeToolkits,
  loading,
  renderRow,
}: AppCatalogGridProps) {
  const { t } = useTranslation("integrations");
  const [search, setSearch] = useState("");

  const categoryOptions = useMemo(
    () =>
      categoriesOf(catalog).map((cat) => ({
        value: cat,
        label: categoryLabel(cat),
      })),
    [catalog],
  );
  const apps = useMemo(
    () =>
      browseCatalog({
        catalog,
        query: search,
        category,
        connected: excludeToolkits ?? new Set(),
      }),
    [catalog, search, category, excludeToolkits],
  );

  // A fresh result list (new search or category) collapses the page cap back to
  // the first page. Adjusting state during render (React's documented pattern)
  // keeps the reset in sync with the new list identity without a wasted paint.
  const [visible, setVisible] = useState(BROWSE_PAGE_SIZE);
  const [shownFor, setShownFor] = useState(apps);
  if (shownFor !== apps) {
    setShownFor(apps);
    setVisible(BROWSE_PAGE_SIZE);
  }

  const visibleApps = apps.slice(0, visible);
  const hasMore = visible < apps.length;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <CatalogSearchField
          className="flex-1"
          value={search}
          onChange={setSearch}
          label={t("picker.searchPlaceholder")}
          clearLabel={t("home.clearSearch")}
        />
        {categoryOptions.length > 0 && (
          <FilterCombobox
            ariaLabel={t("browse.allCategories")}
            allLabel={t("browse.allCategories")}
            searchPlaceholder={t("browse.searchCategories")}
            emptyText={t("browse.noCategoryResults")}
            searchable
            options={categoryOptions}
            value={category}
            onChange={onCategoryChange}
          />
        )}
      </div>

      {apps.length === 0 ? (
        loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-muted">
            <Spinner className="size-4" />
            {t("picker.loading")}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-ink-muted">
            {t("picker.noResults")}
          </p>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleApps.map((tk) => {
              const display = appDisplay(tk.slug, tk);
              const row = renderRow(display, tk);
              return (
                <AppRow
                  key={tk.slug}
                  display={display}
                  description={display.description}
                  onClick={row.onClick}
                  trailing={row.trailing}
                />
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + BROWSE_PAGE_SIZE)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-input px-4 text-xs font-medium text-ink transition-colors hover:bg-chip"
              >
                {t("browse.loadMoreWithRemaining", {
                  count: apps.length - visible,
                })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
