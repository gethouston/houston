import type { KanbanItem } from "@houston-ai/board";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../hooks/use-my-profile";
import { distinctBoardPeople, shortUserLabel } from "../lib/mission-people";
import {
  type FilterFace,
  FilterTrigger,
  PersonFace,
} from "./mission-person-face";
import { MissionPersonTeaser } from "./mission-person-teaser";
import { usePersonFilterMode } from "./use-person-filter-mode";

interface MissionPersonFilterProps {
  items: KanbanItem[];
  filterUserId: string | null;
  onFilterUserIdChange: (userId: string | null) => void;
  collapsed: boolean;
}

export function MissionPersonFilter({
  items,
  filterUserId,
  onFilterUserIdChange,
  collapsed,
}: MissionPersonFilterProps) {
  const { t } = useTranslation("dashboard");
  const { mode, user } = usePersonFilterMode();
  const myProfile = useMyProfile();
  if (mode === "hidden" || !user) return null;

  const selfName = myProfile?.name ?? user.email ?? shortUserLabel(user.id);
  const selfFace: FilterFace = {
    id: user.id,
    label: selfName,
    imageUrl: myProfile?.avatarUrl ?? undefined,
  };

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
    activeText = person?.label ?? shortUserLabel(filterUserId);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterTrigger
          size={collapsed ? "icon-sm" : "sm"}
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
