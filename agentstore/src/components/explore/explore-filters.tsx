import { Plug } from "lucide-react";
import {
  buildExploreHref,
  type ExploreParams,
  type ExploreSort,
} from "@/app/explore/search-params";
import { CategoryChips } from "@/components/category-chips";
import { ChipLink } from "@/components/chip";
import { SearchForm } from "@/components/search-form";
import type { CatalogIntegration } from "@/lib/agents/integrations";
import type { StoreCategory } from "@/lib/store-api-types";

const SORTS: { value: ExploreSort; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "installs", label: "Most installed" },
];

export interface ExploreFiltersProps {
  params: ExploreParams;
  categories: StoreCategory[];
  integrations: CatalogIntegration[];
}

/** The full /explore control surface: search, category + integration chips, sort. */
export function ExploreFilters({
  params,
  categories,
  integrations,
}: ExploreFiltersProps) {
  return (
    <div className="flex flex-col gap-6">
      <SearchForm defaultValue={params.q} placeholder="Search agents" />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Category</h2>
        <CategoryChips
          categories={categories}
          activeSlug={params.category}
          hrefFor={(slug) =>
            buildExploreHref(params, {
              category: slug && slug === params.category ? null : slug,
            })
          }
        />
      </div>

      {integrations.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Works with
          </h2>
          <ul className="flex flex-wrap gap-2">
            {integrations.map((integration) => {
              const active = params.integration === integration.slug;
              return (
                <li key={integration.slug}>
                  <ChipLink
                    href={buildExploreHref(params, {
                      integration: active ? null : integration.slug,
                    })}
                    active={active}
                  >
                    <Plug aria-hidden className="size-3.5" />
                    {integration.label}
                  </ChipLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Sort by</h2>
        <div className="flex flex-wrap gap-2">
          {SORTS.map((option) => (
            <ChipLink
              key={option.value}
              href={buildExploreHref(params, { sort: option.value })}
              active={params.sort === option.value}
            >
              {option.label}
            </ChipLink>
          ))}
        </div>
      </div>
    </div>
  );
}
