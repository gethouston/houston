import { cn } from "@houston-ai/core";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The rounded catalog search field that lives in the page header's trailing
 * slot, mirroring the reference's top-right "Search plugins" pill. Controlled by
 * the page so one query threads into the grouped category catalog below; the
 * installed strip stays unfiltered (it is identity, not discovery). Pill shape
 * (`rounded-full`) and the muted leading magnifier keep it calm against the
 * airy, borderless "plane" composition — a quiet control, not a loud input.
 */
export function CatalogSearchField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("integrations");
  const label = t("home.searchPlaceholder");
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        className="h-9 w-full rounded-full border border-line-input bg-input pl-10 pr-4 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus/20"
      />
    </div>
  );
}
