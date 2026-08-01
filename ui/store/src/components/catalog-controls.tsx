"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchClearButton,
} from "@houston-ai/core";
import { ArrowUpDown, Check, ChevronDown, Search } from "lucide-react";
import { useRef } from "react";

import type { StoreCategoryRow } from "../types";

export type CatalogView = "agents" | "creators";
export type CatalogSort = "installs" | "alphabetical";
const pill =
  "flex h-12 shrink-0 items-center gap-2 rounded-full border border-line-input bg-input px-5 text-[15px] text-ink transition-colors duration-150 hover:bg-hover";
const defaults = {
  searchLabel: "Search the Agent Store",
  searchPlaceholder: "Search agents and creators",
  clearSearch: "Clear search",
  allCategories: "All categories",
  agents: "Agents",
  creators: "Creators",
  sortAgents: "Sort agents",
  mostInstalled: "Most installed",
  alphabetical: "Alphabetical",
};

function MenuRow({
  children,
  active,
  onSelect,
}: {
  children: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="min-w-44 cursor-pointer justify-between px-3 py-2"
    >
      {children}
      {active ? <Check aria-hidden className="size-4" /> : null}
    </DropdownMenuItem>
  );
}

export function CatalogControls({
  categories,
  category,
  view,
  sort,
  query,
  onQueryChange,
  onCategoryChange,
  onViewChange,
  onSortChange,
  labels: provided,
}: {
  categories: StoreCategoryRow[];
  category?: string;
  view: CatalogView;
  sort: CatalogSort;
  query: string;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category?: string) => void;
  onViewChange: (view: CatalogView) => void;
  onSortChange: (sort: CatalogSort) => void;
  labels?: Partial<typeof defaults>;
}) {
  const labels = { ...defaults, ...provided };
  const searchRef = useRef<HTMLInputElement>(null);
  const activeCategory = categories.find((item) => item.slug === category);
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
      <form
        className="min-w-64 flex-1"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="relative flex h-12 items-center gap-3 rounded-full border border-line-input bg-input px-5 transition-colors duration-150 focus-within:ring-[3px] focus-within:ring-focus/30">
          <Search className="size-5 shrink-0 text-ink-muted" />
          <span className="sr-only">{labels.searchLabel}</span>
          <input
            ref={searchRef}
            name="q"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent pr-6 text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
          {query && (
            <SearchClearButton
              label={labels.clearSearch}
              onClear={() => {
                onQueryChange("");
                searchRef.current?.focus();
              }}
            />
          )}
        </label>
      </form>
      {view === "agents" ? (
        <Menu
          trigger={activeCategory?.name ?? category ?? labels.allCategories}
        >
          <MenuRow active={!category} onSelect={() => onCategoryChange()}>
            {labels.allCategories}
          </MenuRow>
          {categories.map((item) => (
            <MenuRow
              key={item.slug}
              active={category === item.slug}
              onSelect={() => onCategoryChange(item.slug)}
            >
              {item.name}
            </MenuRow>
          ))}
        </Menu>
      ) : null}
      <Menu trigger={view === "creators" ? labels.creators : labels.agents}>
        <MenuRow
          active={view === "agents"}
          onSelect={() => onViewChange("agents")}
        >
          {labels.agents}
        </MenuRow>
        <MenuRow
          active={view === "creators"}
          onSelect={() => onViewChange("creators")}
        >
          {labels.creators}
        </MenuRow>
      </Menu>
      {view === "agents" ? (
        <Menu
          trigger={<ArrowUpDown className="size-4" />}
          ariaLabel={labels.sortAgents}
        >
          <MenuRow
            active={sort === "installs"}
            onSelect={() => onSortChange("installs")}
          >
            {labels.mostInstalled}
          </MenuRow>
          <MenuRow
            active={sort === "alphabetical"}
            onSelect={() => onSortChange("alphabetical")}
          >
            {labels.alphabetical}
          </MenuRow>
        </Menu>
      ) : null}
    </div>
  );
}

function Menu({
  trigger,
  ariaLabel,
  children,
}: {
  trigger: React.ReactNode;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={ariaLabel} className={pill}>
          {trigger}
          {typeof trigger === "string" ? (
            <ChevronDown className="size-4 text-ink-muted" />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
