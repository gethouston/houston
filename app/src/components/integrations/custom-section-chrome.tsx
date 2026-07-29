import { CatalogSearchField } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "./section-header";

/**
 * The custom-integrations section's header chrome, split by variant: the
 * `"tab"` form is a controls row (its own search + the Add button, only once
 * rows exist) over the description line; the `"section"` form is the classic
 * heading + count + description beside the Add button. Presentational — the
 * parent owns the query state and the Add button.
 */
export function CustomSectionChrome({
  variant,
  count,
  query,
  onQueryChange,
  addButton,
}: {
  variant: "section" | "tab";
  count: number;
  query: string;
  onQueryChange: (query: string) => void;
  addButton: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  if (variant === "tab") {
    if (count === 0) return null;
    return (
      <>
        <div className="mb-2 flex items-center gap-2">
          <CatalogSearchField
            value={query}
            onChange={onQueryChange}
            label={t("custom.searchPlaceholder")}
            clearLabel={t("custom.clearSearch")}
            className="flex-1"
          />
          {addButton}
        </div>
        <p className="mb-6 text-[13px] text-ink-muted">
          {t("custom.description")}
        </p>
      </>
    );
  }
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <SectionHeader title={t("custom.title")} count={count} />
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {t("custom.description")}
        </p>
      </div>
      {addButton}
    </div>
  );
}
