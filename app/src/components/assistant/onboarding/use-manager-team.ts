import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../../lib/analytics";
import type {
  TeamAnswer,
  TeamConversation,
} from "../../../lib/manager-onboarding/team-script";
import type { Agent } from "../../../lib/types";
import {
  type RosterMember,
  teamFinishState,
} from "../../onboarding/team/team-roster-model";
import { teamFunnelStep } from "../../onboarding/team/team-view-model";
import { useBasicTeam } from "../../onboarding/team/use-basic-team";
import { useTeamFinish } from "../../onboarding/team/use-team-finish";
import { useTeamHiring } from "../../onboarding/team/use-team-hiring";
import { useTeamRoster } from "../../onboarding/team/use-team-roster";
import {
  type AgentRoleStart,
  useAgentRoleState,
} from "../../shell/use-agent-role-state";
import type { RosterRow } from "./manager-roster-list";

export type TeamClosingAnswer = Omit<TeamAnswer, "locked">;

export function useManagerTeam({
  workspaceId,
  start,
  earlierHires,
  conversation,
  onFinished,
}: {
  workspaceId: string;
  start: AgentRoleStart;
  earlierHires: readonly Agent[];
  conversation: TeamConversation;
  onFinished: (closing: TeamClosingAnswer | null) => void;
}) {
  const { t } = useTranslation(["agentOnboarding", "agents"]);
  const hiring = useTeamHiring(workspaceId);
  const roster = useTeamRoster(hiring);
  const industryState = useAgentRoleState(true, start);
  const industry = industryState.contextLabel.trim();
  const basic = useBasicTeam({
    industry,
    contextId: industryState.contextId,
    roster,
  });
  const finishState = teamFinishState(roster.members, earlierHires.length);
  const closing = useRef<TeamClosingAnswer | null>(null);
  const finish = useTeamFinish(finishState, roster.retrySaves, () =>
    onFinished(closing.current),
  );

  const funnelStep = teamFunnelStep(conversation.view);
  const reported = useRef(new Set<string>());
  useEffect(() => {
    if (funnelStep === null || reported.current.has(funnelStep)) return;
    reported.current.add(funnelStep);
    analytics.track("onboarding_step_viewed", { step: funnelStep });
  }, [funnelStep]);

  const problemOf = (member: RosterMember): string | null => {
    if (member.status.kind === "failed")
      return member.status.reason === "nameTaken"
        ? t("agents:toasts.nameConflict", { name: member.name })
        : t("agentOnboarding:roleSetup.createFailed");
    return member.saveFailed ? t("agentOnboarding:roleSetup.saveFailed") : null;
  };

  const earlierRows = earlierHires.map(
    (agent): RosterRow => ({
      key: `earlier-${agent.id}`,
      name: agent.name,
      role: agent.role ?? "",
      color: agent.color,
      status: "hired",
      problem: null,
    }),
  );
  const hireRows = roster.members.map(
    (member): RosterRow => ({
      key: member.key,
      name: member.name,
      role: member.brief.role,
      color: member.color,
      status: member.status.kind,
      problem: problemOf(member),
      onRetry:
        member.status.kind === "failed"
          ? () => roster.retry(member.key)
          : undefined,
      onRemove:
        member.status.kind === "failed"
          ? () => roster.remove(member.key)
          : undefined,
    }),
  );
  const rows = [...earlierRows, ...hireRows];

  return {
    roster,
    industryState,
    basic,
    industry,
    rows,
    finishState,
    anyone: rows.length > 0,
    finishing: finish.busy,
    busy: finish.busy,
    finish: (answer: TeamClosingAnswer | null) => {
      closing.current = answer;
      finish.request();
    },
  };
}

export type ManagerTeam = ReturnType<typeof useManagerTeam>;
