import type { OnboardingSurveyStep } from "../../components/onboarding/survey-steps.ts";

export type SurveyQuestion = OnboardingSurveyStep;

export type TeamQuestion =
  | "teamIndustry"
  | "teamBasic"
  | "teamNext"
  | "teamDone";

export type ReceiptQuestion = "connectAi" | SurveyQuestion | TeamQuestion;

export type ManagerLineId =
  | "hello"
  | "introManager"
  | "introEmployees"
  | "introHow"
  | "connectIntro"
  | "surveyIntro"
  | "teamIntro"
  | "teamResume"
  | "closingTeam"
  | "closingAsk"
  | "profileIntro"
  | "profileThanks";

export interface ManagerReach {
  invite: boolean;
  connect: boolean;
}

export type ScriptLine =
  | {
      kind: "manager";
      key: string;
      id: ManagerLineId;
      name?: string;
      count?: number;
      reach?: ManagerReach;
    }
  | {
      kind: "receipt";
      key: string;
      question: ReceiptQuestion;
      value: string;
      editable: boolean;
    };

export type ScriptReceipt = Extract<ScriptLine, { kind: "receipt" }>;

export type ScriptPrompt =
  | { kind: "wait" }
  | { kind: "connectAi" }
  | { kind: "survey"; question: SurveyQuestion }
  | { kind: "team" }
  | { kind: "finish" }
  | { kind: "openChat" };

export interface Script {
  lines: ScriptLine[];
  prompt: ScriptPrompt;
}
