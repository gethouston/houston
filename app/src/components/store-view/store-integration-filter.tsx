import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLogo, appDisplay, useToolkitBySlug } from "../integrations";

/** Sentinel for "no integration filter"; kept out of the toolkit-slug space so
 *  it can never collide with a real app. */
const ALL = "all";

/**
 * The browse row's integration filter: pick one connected-app the listings must
 * touch, or "All integrations". Real app names and logos (resolved from the
 * Composio toolkit catalog via {@link appDisplay}), never machine slugs; falls
 * back to a prettified slug + favicon when the catalog has not resolved or the
 * deployment serves no integrations. Sits beside {@link StoreSortToggle} in the
 * filter row, so it wears the same quiet, rounded-pill chrome.
 */
export function StoreIntegrationFilter({
  value,
  onChange,
  integrations,
}: {
  /** The selected toolkit slug, or the {@link ALL} sentinel. */
  value: string;
  onChange: (value: string) => void;
  /** The toolkit slugs present across the current catalog, to offer as options. */
  integrations: string[];
}) {
  const { t } = useTranslation("store");
  const bySlug = useToolkitBySlug();

  const options = useMemo(
    () =>
      integrations
        .map((slug) => appDisplay(slug, bySlug.get(slug)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [integrations, bySlug],
  );

  const selected =
    value === ALL ? null : options.find((o) => o.toolkit === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="shrink-0 gap-1.5 rounded-full border-transparent bg-transparent px-3 text-[13px] text-ink-muted shadow-none hover:bg-hover hover:text-ink data-[state=open]:bg-chip data-[state=open]:text-ink dark:bg-transparent dark:hover:bg-hover"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <AppLogo display={selected} size="sm" className="size-4" />
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span>{t("allIntegrations")}</span>
        )}
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL}>{t("allIntegrations")}</SelectItem>
        {options.map((app) => (
          <SelectItem key={app.toolkit} value={app.toolkit}>
            <AppLogo display={app} size="sm" className="size-4" />
            <span>{app.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
