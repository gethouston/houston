import {
  Button,
  CatalogSearchField,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Library, MessageCircle, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  HeaderToolsRow,
  headerSearchFieldClass,
} from "../shell/page-header/header-tools-row";

/** Search and creation move together between the fixed strip and body row. */
export function SkillsControls({
  query,
  onQueryChange,
  onCreateWithChat,
  onAddExisting,
  variant,
  locked = false,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  /** Build a skill together with the AI Employee — the primary path. */
  onCreateWithChat: () => void;
  /** Put a skill the workspace already holds on THIS AI Employee. Absent
   *  where there is no workspace store, and the control is a single button
   *  again. */
  onAddExisting?: () => void;
  variant: "strip" | "row";
  /** The org is locked: nothing new lands on the employee. */
  locked?: boolean;
}) {
  const { t } = useTranslation("skills");
  const inStrip = variant === "strip";
  const label = t("global.createSkill");
  const buttonClass = inStrip ? "h-8" : undefined;

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
      {onAddExisting === undefined ? (
        <Button
          type="button"
          className={buttonClass}
          disabled={locked}
          onClick={onCreateWithChat}
        >
          <Plus className="size-4" />
          {label}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={locked}>
            <Button type="button" className={buttonClass}>
              <Plus className="size-4" />
              {label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onCreateWithChat}>
              <MessageCircle className="size-4" />
              {t("global.createMenu.withChat")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddExisting}>
              <Library className="size-4" />
              {t("global.createMenu.addExisting")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </HeaderToolsRow>
  );
}
