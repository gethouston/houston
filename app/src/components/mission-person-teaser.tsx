import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type FilterFace,
  FilterTrigger,
  PersonFace,
} from "./mission-person-face";
import { CreateTeamDialog } from "./shell/create-team-dialog";

/**
 * The personal-space growth teaser for the person filter (C8 §Client UX). The
 * control is visible even though a solo personal space has nobody to filter to:
 * it offers Everyone plus an "invite your team" row that opens the create-team
 * dialog, so people discover that sharing turns the board multiplayer. There is
 * deliberately NO "My missions" option here (it would filter to zero).
 */
export function MissionPersonTeaser({
  selfFace,
  collapsed,
  onEveryone,
}: {
  selfFace: FilterFace;
  collapsed: boolean;
  onEveryone: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            face={null}
            text={t("peopleFilter.everyone")}
            label={t("peopleFilter.label")}
            collapsed={collapsed}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEveryone}>
            {t("peopleFilter.everyone")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCreateTeamOpen(true)}
            className="gap-2"
          >
            <span className="relative">
              <PersonFace person={selfFace} />
              <UserPlus className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-input text-ink-muted" />
            </span>
            {t("peopleFilter.inviteTeaser")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
      />
    </>
  );
}
