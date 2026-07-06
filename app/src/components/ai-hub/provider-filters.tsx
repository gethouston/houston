/**
 * The Providers-tab filter bar: a search box + a category dropdown. The search
 * markup mirrors `ModelsBrowser` (pill Input with a leading magnifier) and the
 * Select mirrors `DirectoryFilters` (token-styled pill trigger) so the two tabs
 * read identically. Filter state lives in the parent (`ProviderList`); this owns
 * nothing but its own layout.
 */

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { Search } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderCategoryFilter } from "./provider-filtering.ts";

const TRIGGER =
  "h-9 rounded-full border-border bg-secondary px-4 text-[13px] font-medium text-foreground shadow-none data-[placeholder]:text-muted-foreground focus-visible:ring-2";

/** All / featured / gateway / direct / regional / local, in dropdown order. */
const CATEGORIES: readonly ProviderCategoryFilter[] = [
  "all",
  "featured",
  "gateway",
  "direct",
  "regional",
  "local",
];

export function ProviderFilters({
  query,
  setQuery,
  category,
  setCategory,
}: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: ProviderCategoryFilter;
  setCategory: Dispatch<SetStateAction<ProviderCategoryFilter>>;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("providers.search")}
          className="rounded-full border-border bg-secondary pl-9 focus:bg-background"
        />
      </div>

      <Select
        value={category}
        onValueChange={(value) => setCategory(value as ProviderCategoryFilter)}
      >
        <SelectTrigger
          className={TRIGGER}
          aria-label={t("providers.category.label")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {t(`providers.category.${c}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
