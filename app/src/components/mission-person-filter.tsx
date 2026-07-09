import type { KanbanItem } from "@houston-ai/board";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useSession } from "../hooks/use-session";
import { distinctBoardPeople } from "../lib/mission-people";
import { personFilterMode } from "../lib/mission-person-filter-model";
import { hasSpaces, isMultiplayer } from "../lib/org-roles";
import { isTeamWorkspace } from "../lib/space-id";
import { useWorkspaceStore } from "../stores/workspaces";
import {
  type FilterFace,
  FilterTrigger,
  PersonFace,
} from "./mission-person-face";
import { MissionPersonTeaser } from "./mission-person-teaser";

interface MissionPersonFilterProps {
  /** The board items the person roster is drawn from (post agent-filter). */
  items: KanbanItem[];
  /** Currently selected person, or `null` for Everyone. */
  filterUserId: string | null;
  onFilterUserIdChange: (userId: string | null) => void;
  /** Compact layout: collapse the trigger to an icon-only face. */
  collapsed: boolean;
}

/**
 * Filter-by-person control for Mission Control. Three states, decided purely in
 * {@link personFilterMode}:
 * - a real filter (Everyone / My missions / every other human on the board) in
 *   a hosted team space, or on a legacy multiplayer host;
 * - a growth TEASER in a personal space on a spaces host (see
 *   {@link MissionPersonTeaser});
 * - nothing at all off-spaces / single-player / signed out.
 *
 * The gateway stamps attribution; this only narrows the view.
 */
export function MissionPersonFilter({
  items,
  filterUserId,
  onFilterUserIdChange,
  collapsed,
}: MissionPersonFilterProps) {
  const { t } = useTranslation("dashboard");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const user = session?.user;

  const mode = personFilterMode({
    hasSession: !!user,
    spaces: hasSpaces(capabilities),
    multiplayer: isMultiplayer(capabilities),
    teamSpace: isTeamWorkspace(currentWorkspace?.id ?? ""),
  });
  if (mode === "hidden" || !user) return null;

  const meta = (user.user_metadata ?? {}) as {
    name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  const selfName =
    meta.full_name ?? meta.name ?? user.email ?? user.id.slice(0, 8);
  const selfFace: FilterFace = { label: selfName, imageUrl: meta.avatar_url };

  if (mode === "teaser") {
    return (
      <MissionPersonTeaser
        selfFace={selfFace}
        collapsed={collapsed}
        onEveryone={() => onFilterUserIdChange(null)}
      />
    );
  }

  const roster = distinctBoardPeople(items).filter((p) => p.id !== user.id);
  let activeFace: FilterFace | null = null;
  let activeText = t("peopleFilter.everyone");
  if (filterUserId === user.id) {
    activeFace = selfFace;
    activeText = t("peopleFilter.mine");
  } else if (filterUserId) {
    const person = roster.find((p) => p.id === filterUserId);
    activeFace = person ?? null;
    activeText = person?.label ?? filterUserId.slice(0, 8);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterTrigger
          face={activeFace}
          text={activeText}
          label={t("peopleFilter.label")}
          collapsed={collapsed}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onFilterUserIdChange(null)}>
          {t("peopleFilter.everyone")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onFilterUserIdChange(user.id)}
          className="gap-2"
        >
          <PersonFace person={selfFace} />
          {t("peopleFilter.mine")}
        </DropdownMenuItem>
        {roster.map((person) => (
          <DropdownMenuItem
            key={person.id}
            onClick={() => onFilterUserIdChange(person.id)}
            className="gap-2"
          >
            <PersonFace person={person} />
            {person.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
