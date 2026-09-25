import { useTranslation } from "react-i18next";
import type { TeamCardPrimary } from "./team-card-footer";
import { finishPressable, type TeamFinishState } from "./team-roster-model";
import {
  previousTeamView,
  type TeamView,
  type TeamWalkFacts,
} from "./team-view-model";
import type { BasicTeam } from "./use-basic-team";
import type { TeamFinish } from "./use-team-finish";
import type { TeamHireFlow } from "./use-team-hire-flow";

export interface TeamCardActions {
  onBack: (() => void) | null;
  primary: TeamCardPrimary | null;
  secondary?: { label: string; onClick: () => void };
}

/**
 * What the action row offers on each screen.
 *
 * On a question, a catalog pick answers it outright, so Continue only appears
 * while a PICKED answer is held: the industry the survey preselected, or an
 * answer the person came Back to. A typed answer carries its own Continue in
 * its row, and a second one down here would be two buttons for one thing.
 *
 * Hire never waits on the host (the roster creates behind the person). Done
 * is the one press that can: it waits for hires still on their way, and is
 * held while one that failed still needs a Retry or letting go.
 */
export function useTeamCardActions({
  view,
  facts,
  hire,
  basic,
  finish,
  finishState,
  formIds,
  onAnswered,
  onBack,
  onHireAnother,
}: {
  view: TeamView;
  facts: TeamWalkFacts;
  hire: TeamHireFlow;
  basic: BasicTeam;
  finish: TeamFinish;
  finishState: TeamFinishState;
  formIds: { hire: string; basic: string };
  onAnswered: () => void;
  onBack: (previous: TeamView) => void;
  onHireAnother: () => void;
}): TeamCardActions {
  const { t } = useTranslation(["setup", "common"]);
  const previous = previousTeamView(view, facts);
  const back = previous ? () => onBack(previous) : null;
  const { flow } = hire;
  const role = flow.roleState;
  const continueWith = (held: boolean): TeamCardPrimary | null =>
    held
      ? {
          kind: "action",
          label: t("common:actions.continue"),
          onClick: onAnswered,
        }
      : null;
  const done: TeamCardPrimary = {
    kind: "action",
    label: t("common:actions.done"),
    onClick: finish.request,
    disabled: !finishPressable(finishState),
    busy: finish.busy,
  };

  switch (view.kind) {
    case "choice":
      return { onBack: null, primary: finishState === "empty" ? null : done };
    case "basicIndustry":
      return {
        onBack: back,
        primary: continueWith(hire.team.contextId !== null),
      };
    case "hire":
      if (view.step === "context") {
        return { onBack: back, primary: continueWith(role.contextId !== null) };
      }
      if (view.step === "role") {
        return { onBack: back, primary: continueWith(role.roleId !== null) };
      }
      return {
        onBack: back,
        primary: {
          kind: "submit",
          formId: formIds.hire,
          label: t("setup:team.hire.submit"),
          disabled: flow.submitBlocked,
        },
      };
    case "hired":
      return {
        onBack: back,
        secondary: {
          label: t("setup:team.hired.hireAnother"),
          onClick: onHireAnother,
        },
        primary: done,
      };
    case "basic":
      return {
        onBack: back,
        primary: {
          kind: "submit",
          formId: formIds.basic,
          label: t("setup:team.basic.submit"),
          disabled: !basic.hasWork,
          busy: finish.busy,
        },
      };
  }
}
