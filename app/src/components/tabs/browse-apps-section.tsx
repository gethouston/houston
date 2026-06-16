import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Loader2, Plus, ChevronDown, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { tauriConnections } from "../../lib/tauri";
import { useComposioConnect } from "../../hooks/use-composio-connect";

interface BrowseAppsSectionProps {
  connectedToolkits: Set<string>;
}

const PAGE_SIZE = 100;

export function BrowseAppsSection({ connectedToolkits }: BrowseAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { connecting, connect } = useComposioConnect();

  const { data: apiApps } = useQuery({
    queryKey: ["composio-apps"],
    queryFn: () => tauriConnections.listApps(),
    staleTime: 1000 * 60 * 60,
  });

  const catalog = useMemo(() => {
    if (!apiApps || apiApps.length === 0) return [];
    return apiApps.map((a) => ({
      toolkit: a.toolkit,
      name: a.name,
      description: a.description,
      logoUrl: a.logo_url || fallbackLogo(a.toolkit),
      categories: a.categories ?? [],
    }));
  }, [apiApps]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const app of catalog) {
      for (const cat of app.categories) {
        seen.add(cat);
      }
    }
    return Array.from(seen).sort((a, b) =>
      categoryLabel(a).localeCompare(categoryLabel(b)),
    );
  }, [catalog]);

  const available = useMemo(() => {
    let filtered = catalog.filter(
      (app) => !connectedToolkits.has(app.toolkit),
    );
    if (category !== "all") {
      filtered = filtered.filter((app) =>
        app.categories.includes(category),
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.description.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [catalog, connectedToolkits, category, search]);

  const isSearching = search.trim().length > 0;
  const visibleApps = isSearching ? available : available.slice(0, visible);
  const hasMore = !isSearching && visible < available.length;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">
          {t("browse.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("browse.count", { count: available.length })}
        </span>
      </div>

      {/* Search + Category filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("browse.searchPlaceholder")}
            className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        {categories.length > 0 && (
          <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("browse.allCategories")}
                className="inline-flex h-9 items-center gap-2 pl-3 pr-2.5 rounded-full border border-border bg-background text-sm text-foreground cursor-pointer hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                <span className="truncate max-w-[180px]">
                  {category === "all"
                    ? t("browse.allCategories")
                    : categoryLabel(category)}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-60 p-0"
            >
              <Command>
                <CommandInput placeholder={t("browse.searchCategories")} />
                <CommandList>
                  <CommandEmpty>{t("browse.noCategoryResults")}</CommandEmpty>
                  <CommandItem
                    value={t("browse.allCategories")}
                    onSelect={() => {
                      setCategory("all");
                      setVisible(PAGE_SIZE);
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
                          setVisible(PAGE_SIZE);
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

      {/* Grid */}
      {available.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t("browse.noResults")}
        </p>
      )}
      {available.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleApps.map((app) => (
              <AppCard
                key={app.toolkit}
                app={app}
                connecting={connecting === app.toolkit}
                onConnect={connect}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="inline-flex items-center gap-1 h-8 px-4 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary transition-colors duration-200"
              >
                {t("browse.loadMoreWithRemaining", { count: available.length - visible })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface AppInfo {
  toolkit: string;
  name: string;
  description: string;
  logoUrl: string;
  categories: string[];
}

function AppCard({
  app,
  connecting,
  onConnect,
}: {
  app: AppInfo;
  connecting: boolean;
  onConnect: (toolkit: string) => void;
}) {
  const { t } = useTranslation("integrations");
  const [imgError, setImgError] = useState(false);
  const initial = app.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onConnect(app.toolkit)}
      disabled={connecting}
      title={t("browse.connectTitle", { name: app.name })}
      className="group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary hover:bg-black/[0.05] transition-colors disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:bg-black/[0.05]"
    >
      {!imgError ? (
        <img
          src={app.logoUrl}
          alt={app.name}
          className="size-8 rounded-lg object-contain shrink-0 bg-background"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">
            {initial}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">
          {app.name}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {app.description}
        </p>
      </div>
      {connecting ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Plus className="size-3.5 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground transition-colors" />
      )}
    </button>
  );
}

function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}

function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " ");
}
