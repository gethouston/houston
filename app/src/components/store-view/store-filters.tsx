import {
  fetchStoreCategories,
  type StoreCatalogSort,
  type StoreCategory as StoreCategoryEntry,
} from "@houston-ai/engine-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../lib/error-toast";
import {
  resolveStoreCategoryLabel,
  STORE_CATEGORIES,
} from "../../lib/store-categories";

/** How long a browse session trusts the fetched vocabulary before refetching:
 *  the seed changes at most a few times a year, so a day is plenty. */
const CATEGORIES_STALE_MS = 24 * 60 * 60 * 1000;

/** The category pill strip: "All" plus the store's live category vocabulary,
 *  fetched from the gateway (`GET /categories`) and labelled from the SAME i18n
 *  entries the publish wizard's select uses; unknown gateway slugs show the
 *  gateway-provided name. A fetch failure falls back to the static publish-time
 *  seed AND reports (the one place a degrade is silent to the user by design —
 *  the strip still works, so a toast would be noise). */
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
  const { data, error } = useQuery({
    queryKey: ["store-categories"],
    queryFn: () => fetchStoreCategories(),
    staleTime: CATEGORIES_STALE_MS,
  });
  useEffect(() => {
    if (error) {
      reportError("store_categories", "store categories fetch failed", error);
    }
  }, [error]);

  // Runtime vocabulary from the gateway; while it loads, or after it fails,
  // render the static seed so the strip is never empty and "All" stays first.
  const entries: StoreCategoryEntry[] =
    data ?? STORE_CATEGORIES.map((slug) => ({ slug, name: slug }));
  const chips: Array<{ slug: string; label: string }> = [
    { slug: "all", label: t("allCategories") },
    ...entries.map((entry) => {
      const label = resolveStoreCategoryLabel(entry);
      return {
        slug: entry.slug,
        label: "i18nKey" in label ? tPortable(label.i18nKey) : label.text,
      };
    }),
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
