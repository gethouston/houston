import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../../../stores/agents";
import { ContextStep } from "../../shell/context-step";
import type { AgentRoleStart } from "../../shell/use-agent-role-state";
import { TeamBasicView } from "./team-basic-view";
import { useTeamCardActions } from "./team-card-actions";
import { TeamCardFooter } from "./team-card-footer";
import { TeamCardHeading } from "./team-card-heading";
import { TeamChoiceView } from "./team-choice-view";
import { TeamHireView } from "./team-hire-view";
import { TeamHiredView } from "./team-hired-view";
import { teamFinishState } from "./team-roster-model";
import {
  nextTeamView,
  startBasic,
  startHire,
  teamViewKey,
} from "./team-view-model";
import { useBasicTeam } from "./use-basic-team";
import { useTeamFinish } from "./use-team-finish";
import { useTeamHireFlow } from "./use-team-hire-flow";
import { useTeamHiring } from "./use-team-hiring";
import { type TeamCardMode, useTeamNavigation } from "./use-team-navigation";
import { useTeamRoster } from "./use-team-roster";

export const HIRE_FORM_ID = "team-card-hire";
export const BASIC_FORM_ID = "team-card-basic";

/**
 * The card's content in either frame: the screen in hand, scrolling on its
 * own when it outgrows the frame, over an action row that never scrolls away.
 *
 * Every hook that holds an answer lives here, above the screens, so moving
 * between them (and back) never loses what was typed or picked, and both
 * paths hire into the one roster: switching between them keeps everyone.
 */
export function TeamCardFlow({
  workspaceId,
  mode,
  start,
  onDone,
}: {
  workspaceId: string;
  mode: TeamCardMode;
  start: AgentRoleStart;
  onDone: () => void;
}) {
  const { t } = useTranslation("setup");
  const nav = useTeamNavigation(mode);
  const hiring = useTeamHiring(workspaceId);
  const roster = useTeamRoster(hiring);
  // A first run the person quit after hiring resumes here with those hires
  // already in the workspace: they are on the team, so Done is theirs without
  // hiring again. A new workspace starts empty, and the store may still list
  // the previous workspace's employees while it switches.
  const [earlierColors] = useState(() =>
    mode === "first_run"
      ? useAgentStore.getState().agents.map((agent) => agent.color)
      : [],
  );
  const hire = useTeamHireFlow({
    start,
    roster,
    onHired: () => nav.go({ kind: "hired" }),
  });
  const industry = hire.team.contextLabel.trim();
  const basic = useBasicTeam({ industry, roster });
  const finishState = teamFinishState(roster.members, earlierColors.length);
  const finish = useTeamFinish(finishState, roster.retrySaves, onDone);
  const hiredCount = roster.members.length;
  const facts = { hasIndustry: industry !== "", hiredCount };
  const view = nav.view;
  const answered = () => nav.go(nextTeamView(view));
  // A fresh hire once someone is on the roster; before that, a hire the
  // person backed out of keeps its answers.
  const hireNext = () => {
    if (hiredCount > 0) hire.startNextHire();
    nav.go(startHire());
  };

  const actions = useTeamCardActions({
    view,
    facts,
    hire,
    basic,
    finish,
    finishState,
    formIds: { hire: HIRE_FORM_ID, basic: BASIC_FORM_ID },
    onAnswered: answered,
    onBack: nav.back,
    onHireAnother: hireNext,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        // Bled to the frame's edge on a phone so the scrollbar rides the
        // screen edge, not the content; the padding puts the content back.
        // Never scrolls sideways: a step slides in from 12px off its edge.
        className="-mx-5 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-5 md:mx-0 md:px-0"
      >
        <div
          key={teamViewKey(view)}
          data-direction={nav.direction}
          className="create-step-in flex min-h-full flex-col"
        >
          {view.kind === "choice" && (
            <div className="m-auto flex w-full max-w-xl flex-col gap-8">
              <TeamCardHeading
                title={t("team.choice.title")}
                subtitle={t("team.choice.subtitle")}
              />
              <TeamChoiceView
                basicColors={basic.rows.map((row) => row.color)}
                hiredColors={[
                  ...earlierColors,
                  ...roster.members.map((member) => member.color),
                ]}
                onBasic={() => nav.go(startBasic(facts))}
                onHire={hireNext}
              />
            </div>
          )}
          {view.kind === "hire" && (
            <TeamHireView
              step={view.step}
              flow={hire.flow}
              formId={HIRE_FORM_ID}
              onAnswered={answered}
            />
          )}
          {view.kind === "hired" && (
            <TeamHiredView
              members={roster.members}
              takenNames={roster.takenNames}
              onEdit={roster.edit}
              onRetry={roster.retry}
              onRemove={roster.remove}
            />
          )}
          {view.kind === "basicIndustry" && (
            <ContextStep state={hire.team} onAnswered={answered} />
          )}
          {view.kind === "basic" && (
            <TeamBasicView
              team={basic}
              takenNames={roster.takenNames}
              formId={BASIC_FORM_ID}
              onSubmit={() => {
                const outcome = basic.submit();
                if (outcome.kind === "hire") finish.request();
                return outcome;
              }}
              onEdit={roster.edit}
              onRetry={roster.retry}
              onRemove={roster.remove}
            />
          )}
        </div>
      </div>
      <TeamCardFooter {...actions} />
    </div>
  );
}
