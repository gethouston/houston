import type { StoreCatalogSort } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import {
  STORE_CATEGORIES,
  storeCategoryLabelKey,
} from "../../lib/store-categories";

/** The category pill strip: "All" plus the store's 14 seeded categories,
 *  labelled from the SAME i18n entries the publish wizard's select uses. */
export function StoreCategoryChips({
  category,
  onCategoryChange,
}: {
  /** The active category slug, or "all". */
  category: string;
  onCategoryChange: (category: string) => void;
}) {
  const { t } = useTranslation("store");
  const { t: tPortable } = useTranslation("portable");
  const chips: Array<{ slug: string; label: string }> = [
    { slug: "all", label: t("allCategories") },
    ...STORE_CATEGORIES.map((slug) => ({
      slug,
      label: tPortable(storeCategoryLabelKey(slug)),
    })),
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const active = category === chip.slug;
        return (
          <button
            key={chip.slug}
            type="button"
            aria-pressed={active}
            onClick={() => onCategoryChange(chip.slug)}
            className={`rounded-full px-3 py-1 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 ${
              active
                ? "bg-chip font-medium text-ink"
                : "text-ink-muted hover:bg-hover hover:text-ink"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

/** The quiet sort toggle: newest vs most installed. */
export function StoreSortToggle({
  sort,
  onSortChange,
}: {
  sort: StoreCatalogSort;
  onSortChange: (sort: StoreCatalogSort) => void;
}) {
  const { t } = useTranslation("store");
  const options: StoreCatalogSort[] = ["recent", "installs"];
  return (
    <div className="flex shrink-0 gap-1">
      {options.map((option) => {
        const active = sort === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onSortChange(option)}
            className={`rounded-full px-3 py-1 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 ${
              active
                ? "bg-chip font-medium text-ink"
                : "text-ink-muted hover:bg-hover hover:text-ink"
            }`}
          >
            {t(`sort.${option}`)}
          </button>
        );
      })}
    </div>
  );
}
