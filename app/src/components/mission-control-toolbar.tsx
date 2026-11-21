import type { KanbanItem } from "@houston-ai/board";
import { CatalogSearchField } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../hooks/use-org-write-lock";
import type { Agent } from "../lib/types";
import { MissionPersonFilter } from "./mission-person-filter";
import { NewMissionButton } from "./new-mission-button";
import { HeaderSearch } from "./shell/page-header/header-search";

interface MissionControlToolbarProps {
  variant: "strip" | "row";
  items?: KanbanItem[];
  filterUserId?: string | null;
  onFilterUserIdChange?: (userId: string | null) => void;
  search?: string;
  isSearchingText?: boolean;
  onSearchChange?: (value: string) => void;
  agentFilter?: ReactNode;
  modeToggle?: ReactNode;
  newMission?: {
    agents: Agent[];
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    onPick: (agent: Agent) => void;
  };
  collapsed: boolean;
}

export function MissionControlToolbar({
  variant,
  items,
  filterUserId,
  onFilterUserIdChange,
  search = "",
  isSearchingText = false,
  onSearchChange,
  agentFilter,
  modeToggle,
  newMission,
  collapsed,
}: MissionControlToolbarProps) {
  const { t } = useTranslation("dashboard");
  const { locked } = useOrgWriteLock();
  const strip = variant === "strip";

  const searchField = onSearchChange && (
    <HeaderSearch inStrip={strip}>
      <CatalogSearchField
        value={search}
        busy={isSearchingText}
        label={t("search.placeholder")}
        labelShort={t("search.placeholderShort")}
        clearLabel={t("search.clear")}
        busyLabel={t("search.searchingText")}
        className={strip ? "[&_input]:h-8" : "w-full"}
        onChange={onSearchChange}
      />
    </HeaderSearch>
  );

  const cluster = (
    <>
      {onFilterUserIdChange && (
        <MissionPersonFilter
          items={items ?? []}
          filterUserId={filterUserId ?? null}
          onFilterUserIdChange={onFilterUserIdChange}
          collapsed={collapsed}
        />
      )}
      {agentFilter}
      {modeToggle}
      {newMission && <NewMissionButton {...newMission} disabled={locked} />}
    </>
  );

  if (strip) {
    return (
      <>
        {searchField}
        {cluster}
      </>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-5 pt-1 pb-3">
      {searchField}
      <div className="ml-auto flex shrink-0 items-center gap-2">{cluster}</div>
    </div>
  );
}
