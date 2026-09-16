import { Button, CatalogSearchField } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  HeaderToolsRow,
  headerSearchFieldClass,
} from "../shell/page-header/header-tools-row";

/** Search and creation move together between the fixed strip and body row. */
export function SkillsControls({
  query,
  onQueryChange,
  onCreateWithAi,
  variant,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onCreateWithAi: () => void;
  variant: "strip" | "row";
}) {
  const { t } = useTranslation("skills");
  const inStrip = variant === "strip";

  return (
    <HeaderToolsRow
      inStrip={inStrip}
      search={
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("grid.searchSkills")}
          clearLabel={t("grid.clearSearch")}
          className={headerSearchFieldClass(inStrip)}
        />
      }
    >
      <Button
        type="button"
        onClick={onCreateWithAi}
        className={inStrip ? "h-8" : undefined}
      >
        <Plus className="size-4" />
        {t("global.createSkill")}
      </Button>
    </HeaderToolsRow>
  );
}
