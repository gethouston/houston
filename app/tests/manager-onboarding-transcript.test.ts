import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { decodeInteractionAnswersMessage } from "../../ui/chat/src/interaction-answers-message.ts";
import { decodeTeamCard } from "../src/lib/manager-onboarding/onboarding-card-markers.ts";
import { firstRunScript } from "../src/lib/manager-onboarding/script.ts";
import type { ScriptLine } from "../src/lib/manager-onboarding/script-types.ts";
import {
  TEAM_CONVERSATION_START,
  type TeamConversation,
  teamAnswer,
  teamFinished,
} from "../src/lib/manager-onboarding/team-script.ts";
import {
  onboardingImportId,
  onboardingTranscript,
  type TranscriptCopy,
} from "../src/lib/manager-onboarding/transcript.ts";
import {
  createOnboardingSurveyPreference,
  type OnboardingSurveyPreference,
} from "../src/lib/onboarding-survey-record.ts";

const copy: TranscriptCopy = {
  manager: (line) => `say:${line.id}${line.name ? `(${line.name})` : ""}`,
  receipt: (line) =>
    line.question === "connectAi"
      ? { answer: `Connected ${line.value}` }
      : { question: `ask:${line.question}`, answer: `said:${line.value}` },
};

const answered: OnboardingSurveyPreference = {
  ...createOnboardingSurveyPreference(),
  industry: "retail_ecommerce",
  role: "store_manager",
  companySize: "11_50",
  automationGoal: "Answer my emails",
};

const HIRED = {
  question: "teamBasic",
  value: "Avery, Jordan and Riley",
} as const;

function finishedFirstRun(
  team: TeamConversation = TEAM_CONVERSATION_START,
): ScriptLine[] {
  return firstRunScript({
    stage: "team",
    firstName: "Ana",
    loading: false,
    providerId: "anthropic",
    survey: answered,
    editing: null,
    earlierHires: 0,
    team: teamFinished(team, HIRED),
    reach: { invite: false, connect: true },
  }).lines;
}

const flat = (content: string) => content.split("\n\n").slice(1).join("\n\n");

const said = (content: string) =>
  decodeTeamCard(content) ? `card> ${flat(content)}` : content;

describe("onboardingTranscript", () => {
  it("writes every line in the order shown: the manager's as assistant messages, each answer as the person's", () => {
    const transcript = onboardingTranscript(
      "first_run",
      finishedFirstRun(),
      copy,
    );
    strictEqual(transcript.importId, "onboarding:first_run");
    strictEqual(transcript.at, "start");
    strictEqual(
      onboardingTranscript("profile_completion", finishedFirstRun(), copy).at,
      undefined,
    );
    deepStrictEqual(
      transcript.messages.map((m) =>
        m.role === "assistant" ? said(m.content) : `user> ${flat(m.content)}`,
      ),
      [
        "say:hello(Ana)",
        "say:introManager",
        "say:introEmployees",
        "say:introHow",
        "say:connectIntro",
        "user> Connected anthropic",
        "say:surveyIntro",
        "user> ask:industry: said:retail_ecommerce",
        "user> ask:role: said:store_manager",
        "user> ask:companySize: said:11_50",
        "user> ask:goal: said:Answer my emails",
        "say:teamIntro",
        "user> ask:teamBasic: said:Avery, Jordan and Riley",
        "card> say:closingTeam",
      ],
    );
  });

  it("keeps a resumed run's Hire one more before the team it hired, in order", () => {
    const team = teamAnswer(
      TEAM_CONVERSATION_START,
      { question: "teamNext", value: "another" },
      TEAM_CONVERSATION_START.view,
    );
    const { messages } = onboardingTranscript(
      "first_run",
      finishedFirstRun(team),
      copy,
    );
    deepStrictEqual(
      messages
        .slice(11, 14)
        .map((m) =>
          m.role === "assistant" ? said(m.content) : `user> ${flat(m.content)}`,
        ),
      [
        "say:teamIntro",
        "user> ask:teamNext: said:another",
        "user> ask:teamBasic: said:Avery, Jordan and Riley",
      ],
    );
  });

  it("ends on the team card, which carries what the manager can do here", () => {
    const { messages } = onboardingTranscript(
      "first_run",
      finishedFirstRun(),
      copy,
    );
    const last = messages.at(-1);
    strictEqual(last?.role, "assistant");
    deepStrictEqual(decodeTeamCard(last?.content ?? ""), {
      reach: { invite: false, connect: true },
    });
  });

  it("keeps each answer the receipt card the person saw", () => {
    const [, , , , , connected, , industry] = onboardingTranscript(
      "first_run",
      finishedFirstRun(),
      copy,
    ).messages;
    deepStrictEqual(decodeInteractionAnswersMessage(connected.content), {
      lines: [{ answer: "Connected anthropic" }],
    });
    deepStrictEqual(decodeInteractionAnswersMessage(industry.content), {
      lines: [{ question: "ask:industry", answer: "said:retail_ecommerce" }],
    });
  });

  it("names each conversation's import once, so finishing it twice writes it once", () => {
    const receipt = (question: "industry" | "companySize" | "goal") =>
      ({
        kind: "receipt",
        key: question,
        question,
        value: "x",
        editable: false,
      }) as const;
    strictEqual(
      onboardingImportId("first_run", [receipt("industry")]),
      "onboarding:first_run",
    );
    const round = [receipt("companySize"), receipt("goal")];
    strictEqual(
      onboardingImportId("profile_completion", round),
      "onboarding:profile_completion:company_size:goal",
    );
    strictEqual(
      onboardingImportId("profile_completion", round),
      onboardingImportId("profile_completion", [...round]),
    );
    ok(
      /^[a-z0-9][a-z0-9:_-]{0,127}$/.test(
        onboardingImportId("profile_completion", round),
      ),
    );
  });
});
