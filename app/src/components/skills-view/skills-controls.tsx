import {
  Button,
  CatalogSearchField,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeaderSearch } from "../shell/page-header/header-search";

/** Search and creation move together between the fixed strip and body row. */
export function SkillsControls({
  query,
  onQueryChange,
  onCreateWithAi,
  onAddManually,
  variant,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onCreateWithAi: () => void;
  onAddManually: () => void;
  variant: "strip" | "row";
}) {
  const { t } = useTranslation("skills");
  const inStrip = variant === "strip";

  return (
    <div
      className={
        inStrip
          ? "flex items-center gap-2"
          : "mb-8 flex items-center gap-2 pt-2"
      }
    >
      <HeaderSearch inStrip={inStrip}>
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("grid.searchSkills")}
          clearLabel={t("grid.clearSearch")}
          className={inStrip ? "[&_input]:h-8" : "w-full"}
        />
      </HeaderSearch>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" className={inStrip ? "h-8" : undefined}>
            <Plus className="size-4" />
            {t("global.newSkill")}
            <ChevronDown className="size-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onCreateWithAi}>
            {t("global.createWithAi")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddManually}>
            {t("global.addManually")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
