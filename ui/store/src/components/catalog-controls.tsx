"use client";

import {
  CatalogSearchField,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";

import type { StoreCategoryRow } from "../types";

export type CatalogView = "agents" | "creators";
export type CatalogSort = "installs" | "alphabetical";
const pill =
  "flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-chip px-4 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/20";
const defaults = {
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
  variant = "row",
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
  /**
   * `row` is the site's full-width toolbar: the search grows to fill the
   * measure and the cluster wraps. `strip` rides inside a host's header row
   * beside other chrome, so the search holds a fixed width and nothing wraps.
   */
  variant?: "row" | "strip";
  labels?: Partial<typeof defaults>;
}) {
  const labels = { ...defaults, ...provided };
  const activeCategory = categories.find((item) => item.slug === category);
  return (
    <div
      className={
        variant === "strip"
          ? "flex min-w-0 items-center gap-2"
          : "flex w-full min-w-0 flex-wrap items-center gap-3"
      }
    >
      <form
        className={variant === "strip" ? "w-56 shrink-0" : "min-w-64 flex-1"}
        onSubmit={(event) => event.preventDefault()}
      >
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={labels.searchPlaceholder}
          clearLabel={labels.clearSearch}
        />
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
