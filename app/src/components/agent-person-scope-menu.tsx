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
import { useCapabilities } from "../hooks/use-capabilities";
import { useMyProfile } from "../hooks/use-my-profile";
import { buildScopeOptions } from "../lib/agent-person-scope";
import { distinctBoardPeople } from "../lib/mission-people";
import { isTeamWorkspace } from "../lib/space-id";
import type { Agent } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentPersonScope } from "./agent-person-scope-context";
import { useAgentBoardPeople } from "./board/use-agent-board-people";
import {
  type FilterFace,
  FilterTrigger,
  PersonFace,
} from "./mission-person-face";
import { agentShareSurface } from "./tabs/agent-access-model";
import { AgentShareSurfaces } from "./tabs/agent-share-surfaces";
import { usePersonFilterMode } from "./use-person-filter-mode";

/**
 * The per-agent PERSON SCOPE control that lives in the agent header, beside the
 * Share button (it replaces the old per-agent board toolbar filter). The
 * trigger shows the SELECTED person's face + short name so the default — the
 * signed-in user — teaches that the dropdown exists and is theirs.
 *
 * Menu: me first (my missions), Everyone, then every other contributor on this
 * agent's items, a divider, and a quiet "Invite teammates" row. That last row
 * is not a scope — it opens the SAME share flow as the header Share button
 * ({@link AgentShareSurfaces} keyed by {@link agentShareSurface}), the
 * actionable end of the sharing reminder.
 *
 * Same gate as the cross-agent filter via {@link usePersonFilterMode}: nothing
 * renders off spaces / single-player / signed out.
 */
export function AgentPersonScopeMenu({
  agent,
  collapsed,
}: {
  agent: Agent;
  collapsed: boolean;
}) {
  const { t } = useTranslation(["dashboard", "teams"]);
  const { mode, user } = usePersonFilterMode();
  const { scope, setScope } = useAgentPersonScope();
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const peopleById = useAgentBoardPeople(agent.folderPath);
  const myProfile = useMyProfile();
  const [shareOpen, setShareOpen] = useState(false);

  if (mode === "hidden" || !user) return null;

  const selfName = myProfile?.name ?? user.email ?? user.id.slice(0, 8);
  const selfShort = selfName.split(/\s+/)[0] || selfName;
  const selfFace: FilterFace = {
    label: selfName,
    imageUrl: myProfile?.avatarUrl ?? undefined,
  };

  const roster = distinctBoardPeople(
    Array.from(peopleById.values()).map((people) => ({ people })),
  );
  const options = buildScopeOptions(roster, user.id);

  let activeFace: FilterFace | null = null;
  let activeText = t("dashboard:peopleFilter.everyone");
  if (scope.kind === "me") {
    activeFace = selfFace;
    activeText = selfShort;
  } else if (scope.kind === "person") {
    const person = roster.find((p) => p.id === scope.userId);
    activeFace = person ?? null;
    activeText = person?.label ?? scope.userId.slice(0, 8);
  }

  const inPersonalSpace = !isTeamWorkspace(current?.id ?? "");
  const surface = agentShareSurface(capabilities, agent, inPersonalSpace);
  const inviteLabel =
    surface === "view"
      ? t("teams:share.viewButton")
      : t("dashboard:peopleFilter.invite");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterTrigger
            face={activeFace}
            text={activeText}
            label={t("dashboard:peopleFilter.label")}
            collapsed={collapsed}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {options.map((option) =>
            option.scope.kind === "me" ? (
              <DropdownMenuItem
                key="me"
                onClick={() => setScope(option.scope)}
                className="gap-2"
              >
                <PersonFace person={selfFace} />
                <span>{selfName}</span>
                <span className="ml-auto text-ink-muted text-xs">
                  {t("dashboard:peopleFilter.mine")}
                </span>
              </DropdownMenuItem>
            ) : option.scope.kind === "everyone" ? (
              <DropdownMenuItem
                key="everyone"
                onClick={() => setScope(option.scope)}
              >
                {t("dashboard:peopleFilter.everyone")}
              </DropdownMenuItem>
            ) : (
              option.person && (
                <DropdownMenuItem
                  key={option.person.id}
                  onClick={() => setScope(option.scope)}
                  className="gap-2"
                >
                  <PersonFace person={option.person} />
                  {option.person.label}
                </DropdownMenuItem>
              )
            ),
          )}
          {surface !== "none" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShareOpen(true)}
                className="gap-2 text-ink-muted"
              >
                <UserPlus className="size-4" />
                {inviteLabel}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AgentShareSurfaces
        agent={agent}
        surface={surface}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
