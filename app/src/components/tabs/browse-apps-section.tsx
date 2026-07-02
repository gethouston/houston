import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { appDisplay, BrowseAppRow } from "./integrations-app-rows";
import {
  BROWSE_PAGE_SIZE,
  browseCatalog,
  categoriesOf,
  categoryLabel,
} from "./integrations-tab-model";

interface BrowseAppsSectionProps {
  catalog: IntegrationToolkit[];
  connectedToolkits: ReadonlySet<string>;
  /** Toolkit slug currently mid-OAuth, if any (spinner on its row). */
  connectingToolkit?: string | null;
  onConnect: (toolkit: string) => void;
}

/** The full app catalog: search + category filter + paginated grid. */
export function BrowseAppsSection({
  catalog,
  connectedToolkits,
  connectingToolkit,
  onConnect,
}: BrowseAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [visible, setVisible] = useState(BROWSE_PAGE_SIZE);

  const categories = useMemo(() => categoriesOf(catalog), [catalog]);
  const available = useMemo(
    () =>
      browseCatalog({
        catalog,
        query: search,
        category,
        connected: connectedToolkits,
      }),
    [catalog, search, category, connectedToolkits],
  );

  const isSearching = search.trim().length > 0;
  const visibleApps = isSearching ? available : available.slice(0, visible);
  const hasMore = !isSearching && visible < available.length;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {t("browse.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("browse.count", { count: available.length })}
        </span>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("browse.searchPlaceholder")}
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
                <span className="max-w-[180px] truncate">
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

      {available.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("browse.noResults")}
        </p>
      )}
      {available.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleApps.map((tk) => (
              <BrowseAppRow
                key={tk.slug}
                app={appDisplay(tk.slug, tk)}
                connecting={connectingToolkit === tk.slug}
                onConnect={() => onConnect(tk.slug)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + BROWSE_PAGE_SIZE)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-secondary"
              >
                {t("browse.loadMoreWithRemaining", {
                  count: available.length - visible,
                })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
