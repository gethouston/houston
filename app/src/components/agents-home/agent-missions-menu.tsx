import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Archive, Ellipsis, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The task list's overflow control: the two things a phone list needs but
 * cannot afford a permanent row for.
 *
 * Search hides behind it because an always-on field would take the screen's
 * first line from the tasks, and most visits scroll rather than search. The
 * archive hides behind it because it is the one band that is not part of the
 * list's job — reaching it is a deliberate act, not a scroll away.
 */
export function AgentMissionsMenu({
  onSearch,
  onArchived,
}: {
  onSearch: () => void;
  onArchived: () => void;
}) {
  const { t } = useTranslation("shell");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("agentsHome.menu.label")}
        data-testid="agent-missions-menu"
        className="ht-hairline flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Ellipsis aria-hidden className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          data-testid="agent-missions-menu-search"
          onSelect={onSearch}
        >
          <Search aria-hidden className="size-4" />
          {t("agentsHome.menu.search")}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="agent-missions-menu-archived"
          onSelect={onArchived}
        >
          <Archive aria-hidden className="size-4" />
          {t("agentsHome.menu.archived")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
