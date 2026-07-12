import type { StoreCategory } from "@/lib/store-api-types";
import { ChipLink } from "./chip";

export interface CategoryChipsProps {
  categories: StoreCategory[];
  /** The currently selected category slug, if any. */
  activeSlug?: string;
  /** Build the href for a category slug (or `null` for the "All" chip). */
  hrefFor: (slug: string | null) => string;
  /** Show the leading "All" chip (defaults to true). */
  includeAll?: boolean;
}

/** A wrapping row of category filter chips. Selection is a link, never a dropdown. */
export function CategoryChips({
  categories,
  activeSlug,
  hrefFor,
  includeAll = true,
}: CategoryChipsProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {includeAll && (
        <li>
          <ChipLink href={hrefFor(null)} active={!activeSlug}>
            All
          </ChipLink>
        </li>
      )}
      {categories.map((category) => (
        <li key={category.slug}>
          <ChipLink
            href={hrefFor(category.slug)}
            active={activeSlug === category.slug}
          >
            {category.name}
          </ChipLink>
        </li>
      ))}
    </ul>
  );
}
