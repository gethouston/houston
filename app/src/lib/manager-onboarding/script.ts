import { ONBOARDING_SURVEY_STEPS } from "../../components/onboarding/survey-steps.ts";
import type { OnboardingSurveyPreference } from "../onboarding-survey-record.ts";
import { finalize } from "./changeable.ts";
import { closingPart } from "./closing-script.ts";
import type {
  ManagerLineId,
  ManagerReach,
  Script,
  ScriptLine,
  ScriptPrompt,
  SurveyQuestion,
} from "./script-types.ts";
import { surveyAnswer, surveyAnswered } from "./survey-script.ts";
import { type TeamConversation, teamLines } from "./team-script.ts";

export { changeableAnswer } from "./changeable.ts";
export type {
  ManagerLineId,
  ManagerReach,
  ReceiptQuestion,
  Script,
  ScriptLine,
  ScriptPrompt,
  ScriptReceipt,
  SurveyQuestion,
  TeamQuestion,
} from "./script-types.ts";

export type FirstRunStage = "connectAi" | "survey" | "team";

export interface FirstRunInput {
  stage: FirstRunStage;
  firstName: string | null;
  loading: boolean;
  providerId: string | null;
  survey: OnboardingSurveyPreference | null;
  editing: SurveyQuestion | null;
  earlierHires: number;
  team: TeamConversation;
  reach: ManagerReach | null;
}

const WAIT: ScriptPrompt = { kind: "wait" };

const say = (id: ManagerLineId): ScriptLine => ({
  kind: "manager",
  key: id,
  id,
});

function receipt(
  key: string,
  question: SurveyQuestion | "connectAi",
  value: string,
): ScriptLine {
  return { kind: "receipt", key, question, value, editable: false };
}

function surveyPart(
  lines: ScriptLine[],
  record: OnboardingSurveyPreference | null,
  plan: readonly SurveyQuestion[],
  editing: SurveyQuestion | null,
): SurveyQuestion | null {
  for (const question of plan) {
    if (question === editing || !surveyAnswered(record, question))
      return question;
    const answer = surveyAnswer(record, question);
    if (answer !== null)
      lines.push(receipt(`survey:${question}`, question, answer));
  }
  return null;
}

function introLines(firstName: string | null): ScriptLine[] {
  return [
    {
      kind: "manager",
      key: "hello",
      id: "hello",
      ...(firstName === null ? {} : { name: firstName }),
    },
    say("introManager"),
    say("introEmployees"),
    say("introHow"),
    say("connectIntro"),
  ];
}

export function firstRunScript(input: FirstRunInput): Script {
  const lines = introLines(input.firstName);
  if (input.stage === "connectAi")
    return finalize(lines, input.loading ? WAIT : { kind: "connectAi" });

  lines.push(receipt("connectAi", "connectAi", input.providerId ?? ""));
  lines.push(say("surveyIntro"));
  const asking = surveyPart(
    lines,
    input.survey,
    ONBOARDING_SURVEY_STEPS,
    input.editing,
  );
  if (asking !== null) {
    const answerable = input.editing !== null || input.stage === "survey";
    return finalize(
      lines,
      answerable && !input.loading
        ? { kind: "survey", question: asking }
        : WAIT,
    );
  }
  if (input.stage === "survey") return finalize(lines, WAIT);

  lines.push(say("teamIntro"));
  if (input.earlierHires > 0)
    lines.push({
      kind: "manager",
      key: "teamResume",
      id: "teamResume",
      count: input.earlierHires,
    });
  lines.push(...teamLines(input.team));
  if (input.team.finished)
    return finalize(lines, closingPart(lines, input.survey, input.reach));
  return finalize(lines, input.loading ? WAIT : { kind: "team" });
}

export function profileScript(input: {
  plan: readonly SurveyQuestion[];
  survey: OnboardingSurveyPreference | null;
  editing: SurveyQuestion | null;
}): Script {
  const lines: ScriptLine[] = [say("profileIntro")];
  const asking = surveyPart(lines, input.survey, input.plan, input.editing);
  if (asking !== null)
    return finalize(lines, { kind: "survey", question: asking });
  lines.push(say("profileThanks"));
  return finalize(lines, { kind: "finish" });
}
