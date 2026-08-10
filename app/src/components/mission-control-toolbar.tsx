import type { KanbanItem } from "@houston-ai/board";
import { CatalogSearchField } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../lib/types";
import { MissionPersonFilter } from "./mission-person-filter";
import { NewMissionButton } from "./new-mission-button";
import { HeaderSearch } from "./shell/page-header/header-search";

/**
 * A board section's own tools: how it is narrowed, and the one thing you came
 * here to do. It draws in two forms, and the CALLER never picks — the team
 * chrome measures its strip and says which one is honest for the width
 * (`team-chrome-tools.tsx`).
 *
 * - **`strip`**: the third zone of the one-row team strip, at the right edge.
 *   A compact search that grows when you use it, the person filter, the
 *   primary action. No padding of its own; the strip owns that.
 * - **`row`**: the two-row fallback, unchanged from before the strip existed —
 *   a full-width bar under the chrome, search pinned left, cluster right.
 *
 * Identity and navigation are never here in either form: that is the crumb and
 * the tabs. The archive is a TAB too, so this has no entry pill, no overflow
 * menu and no back button to compete with its one filled control.
 */
interface MissionControlToolbarProps {
  /** Which form to draw. The chrome decides; see the module comment. */
  variant: "strip" | "row";
  /** Visible board items (post agent-filter) — feeds the person-filter roster.
   *  Omitted by the Archived section, which has no attribution filter. */
  items?: KanbanItem[];
  /** Selected person for the attribution filter, or `null` for Everyone. */
  filterUserId?: string | null;
  /** When set, renders the filter-by-person control (active board only). */
  onFilterUserIdChange?: (userId: string | null) => void;
  search?: string;
  isSearchingText?: boolean;
  /** When set, renders the text-search field. */
  onSearchChange?: (value: string) => void;
  /** This SECTION's own agent filter capsule (the archive's). Rendered in the
   *  same slot the person filter takes on the active board, so both board
   *  sections read left to right as search, filter, primary action. */
  agentFilter?: ReactNode;
  modeToggle?: ReactNode;
  /** The section's primary action. Both board sections carry it, and both
   *  answer "whose task?" the same way (`board/new-mission-target.ts`). */
  newMission?: {
    agents: Agent[];
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    onPick: (agent: Agent) => void;
  };
  /** Compact layout: a chat panel is open, so the board is narrow. Collapses
   *  the person filter to its avatar so the row stays on one line. */
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
      {newMission && <NewMissionButton {...newMission} />}
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
