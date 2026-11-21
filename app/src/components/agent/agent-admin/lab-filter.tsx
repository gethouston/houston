import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { labsInCatalog, type ProviderValue } from "../../ai-hub/facets.ts";
import { labName } from "../../ai-hub/format.ts";
import { FilterCombobox } from "../../shell/filter-combobox.tsx";

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
