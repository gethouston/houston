import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { labsInCatalog, type ProviderValue } from "../../ai-hub/facets.ts";
import { labName } from "../../ai-hub/format.ts";
import { FilterCombobox } from "../../shell/filter-combobox.tsx";

/**
 * The allowed-models editor's "Filter by lab" control: the shared
 * {@link FilterCombobox} (Popover + cmdk Command, the house picker idiom) over
 * the labs present in the catalog, each option showing the lab's colorful brand
 * mark + proper-noun name, filterable by the in-dropdown search. This is purely
 * a VIEW filter over the model lists (via `filterModels`) — it never touches
 * saved data. Self-hides when the catalog is a single lab (a lone, useless
 * option), mirroring the AI-hub provider combobox.
 */
export function LabFilter({
  models,
  value,
  onChange,
  className,
}: {
  models: CatalogModel[];
  value: ProviderValue;
  onChange: (next: ProviderValue) => void;
  className?: string;
}) {
  const { t } = useTranslation("teams");
  const labs = useMemo(() => labsInCatalog(models), [models]);

  if (labs.length <= 1) return null;

  return (
    <FilterCombobox
      className={className}
      ariaLabel={t("agentAdmin.models.labFilter")}
      allLabel={t("agentAdmin.models.allLabs")}
      searchPlaceholder={t("agentAdmin.models.searchLabs")}
      emptyText={t("agentAdmin.models.noLabs")}
      searchable
      options={labs.map((lab) => ({
        value: lab,
        label: labName(lab),
        mark: lab,
      }))}
      value={value}
      onChange={(next) => onChange(next as ProviderValue)}
    />
  );
}
