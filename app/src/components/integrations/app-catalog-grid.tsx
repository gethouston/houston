import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Check, ChevronDown, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AppDisplay, appDisplay } from "./app-display";
import { AppRow } from "./app-row";
import {
  BROWSE_PAGE_SIZE,
  browseCatalog,
  categoriesOf,
  categoryLabel,
} from "./model";

/** What one app row contributes: its trailing control + optional row click. */
export interface AppCatalogRow {
  trailing: ReactNode;
  onClick?: () => void;
}

interface AppCatalogGridProps {
  catalog: IntegrationToolkit[];
  /** Apps to hide entirely (e.g. already-connected in the connect flow). */
  excludeToolkits?: ReadonlySet<string>;
  /** The catalog is still fetching (show a loader, not a "no apps" message). */
  loading?: boolean;
  /** Per-app trailing control (+ optional row click). Owns the row's action. */
  renderRow: (app: AppDisplay, toolkit: IntegrationToolkit) => AppCatalogRow;
}

/**
 * The shared app-catalog shell: a search box + a category dropdown + a paginated
 * two-column {@link AppRow} grid + load-more over the ~1000-app catalog. The
 * per-row action (connect button, allow toggle, ...) is delegated via
 * `renderRow`, so both the Integrations tab's connect browser and the manager's
 * allowlist editor render the same layout without duplicating the shell markup.
 */
export function AppCatalogGrid({
  catalog,
  excludeToolkits,
  loading,
  renderRow,
}: AppCatalogGridProps) {
  const { t } = useTranslation("integrations");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [visible, setVisible] = useState(BROWSE_PAGE_SIZE);

  const categories = useMemo(() => categoriesOf(catalog), [catalog]);
  const results = useMemo(
    () =>
      browseCatalog({
        catalog,
        query: search,
        category,
        connected: excludeToolkits ?? new Set(),
      }),
    [catalog, search, category, excludeToolkits],
  );
  const visibleApps = results.slice(0, visible);
  const hasMore = visible < results.length;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(BROWSE_PAGE_SIZE);
            }}
            placeholder={t("picker.searchPlaceholder")}
            className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        {categories.length > 0 && (
          <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("browse.allCategories")}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-background pl-3 pr-2.5 text-sm text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <span className="max-w-[160px] truncate">
                  {category === "all"
                    ? t("browse.allCategories")
                    : categoryLabel(category)}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-0">
              <Command>
                <CommandInput placeholder={t("browse.searchCategories")} />
                <CommandList>
                  <CommandEmpty>{t("browse.noCategoryResults")}</CommandEmpty>
                  <CommandItem
                    value={t("browse.allCategories")}
                    onSelect={() => {
                      setCategory("all");
                      setVisible(BROWSE_PAGE_SIZE);
                      setCategoryOpen(false);
                    }}
                  >
                    <span className="flex-1">{t("browse.allCategories")}</span>
                    {category === "all" && <Check className="size-4" />}
                  </CommandItem>
                  {categories.map((cat) => {
                    const label = categoryLabel(cat);
                    return (
                      <CommandItem
                        key={cat}
                        value={label}
                        onSelect={() => {
                          setCategory(cat);
                          setVisible(BROWSE_PAGE_SIZE);
                          setCategoryOpen(false);
                        }}
                      >
                        <span className="flex-1">{label}</span>
                        {category === cat && <Check className="size-4" />}
                      </CommandItem>
                    );
                  })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {results.length === 0 ? (
        loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {t("picker.loading")}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
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
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {t("browse.loadMoreWithRemaining", {
                  count: results.length - visible,
                })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
