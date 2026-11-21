import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  changeableAnswer,
  type FirstRunInput,
  firstRunScript,
  profileScript,
  type Script,
} from "../src/lib/manager-onboarding/script.ts";
import {
  TEAM_CONVERSATION_START,
  teamAnswer,
  teamFinished,
  teamUndo,
} from "../src/lib/manager-onboarding/team-script.ts";
import {
  createOnboardingSurveyPreference,
  type OnboardingSurveyPreference,
} from "../src/lib/onboarding-survey-record.ts";

const record = (
  patch: Partial<OnboardingSurveyPreference>,
): OnboardingSurveyPreference => ({
  ...createOnboardingSurveyPreference(),
  ...patch,
});

const answered = record({
  industry: "retail_ecommerce",
  role: "store_manager",
  companySize: "2_10",
  automationGoal: "Answer my emails",
});

const INTRO = [
  "m:hello",
  "m:introManager",
  "m:introEmployees",
  "m:introHow",
  "m:connectIntro",
];

const base: FirstRunInput = {
  stage: "connectAi",
  firstName: null,
  loading: false,
  providerId: null,
  survey: null,
  editing: null,
  earlierHires: 0,
  team: TEAM_CONVERSATION_START,
  reach: { invite: false, connect: false },
};

const tags = (script: Script) =>
  script.lines.map((line) =>
    line.kind === "manager"
      ? `m:${line.id}`
      : `r:${line.question}${line.editable ? "*" : ""}`,
  );

describe("firstRunScript: the hello", () => {
  it("opens with the manager's hello, one line at a time, then asks to connect", () => {
    const script = firstRunScript(base);
    deepStrictEqual(tags(script), INTRO);
    deepStrictEqual(script.prompt, { kind: "connectAi" });
  });

  it("greets the person by their first name when it is known", () => {
    const [hello] = firstRunScript({ ...base, firstName: "Ana" }).lines;
    strictEqual(hello.kind === "manager" && hello.name, "Ana");
  });

  it("greets without a name when none is known", () => {
    const [hello] = firstRunScript(base).lines;
    strictEqual(hello.kind === "manager" && "name" in hello, false);
  });

  it("keeps the hello as history once the person has answered", () => {
    const script = firstRunScript({
      ...base,
      stage: "survey",
      providerId: "anthropic",
    });
    deepStrictEqual(tags(script).slice(0, INTRO.length), INTRO);
  });
});

describe("firstRunScript: connecting the AI", () => {
  it("asks nothing while the provider scan still loads", () => {
    deepStrictEqual(firstRunScript({ ...base, loading: true }).prompt, {
      kind: "wait",
    });
  });

  it("connect comes first even when the survey is already answered", () => {
    const script = firstRunScript({ ...base, survey: answered });
    deepStrictEqual(script.prompt, { kind: "connectAi" });
    strictEqual(script.lines.length, INTRO.length);
  });
});

describe("firstRunScript: the survey", () => {
  const survey: FirstRunInput = {
    ...base,
    stage: "survey",
    providerId: "anthropic",
  };

  it("records the connection, then asks the first question", () => {
    const script = firstRunScript(survey);
    deepStrictEqual(tags(script), [...INTRO, "r:connectAi", "m:surveyIntro"]);
    const connected = script.lines[INTRO.length];
    strictEqual(connected.kind === "receipt" && connected.value, "anthropic");
    deepStrictEqual(script.prompt, { kind: "survey", question: "industry" });
  });

  it("resumes at the first unanswered question with the answers as history", () => {
    const script = firstRunScript({
      ...survey,
      survey: record({ industry: "legal" }),
    });
    deepStrictEqual(tags(script).slice(-1), ["r:industry*"]);
    deepStrictEqual(script.prompt, { kind: "survey", question: "role" });
  });

  it("offers a change on the latest answer only", () => {
    const script = firstRunScript({
      ...survey,
      survey: record({ industry: "legal", role: "paralegal" }),
    });
    deepStrictEqual(tags(script).slice(-2), ["r:industry", "r:role*"]);
  });

  it("changing an answer asks that question again and hides the ones after", () => {
    const script = firstRunScript({
      ...survey,
      survey: record({ industry: "legal", role: "paralegal" }),
      editing: "role",
    });
    deepStrictEqual(tags(script).slice(-1), ["r:industry*"]);
    deepStrictEqual(script.prompt, { kind: "survey", question: "role" });
  });

  it("a stored skip is an answer, never asked again", () => {
    const script = firstRunScript({
      ...survey,
      survey: record({
        industry: "skipped",
        role: "skipped",
        companySize: "skipped",
        goalSkipped: true,
      }),
    });
    deepStrictEqual(script.prompt, { kind: "wait" });
  });

  it("waits for the route once every answer is in", () => {
    deepStrictEqual(firstRunScript({ ...survey, survey: answered }).prompt, {
      kind: "wait",
    });
  });

  it("a department answered before the role question answers the role, with no receipt", () => {
    const script = firstRunScript({
      ...survey,
      survey: record({ segment: "operations", industry: "legal" }),
    });
    deepStrictEqual(tags(script).slice(-1), ["r:industry*"]);
    deepStrictEqual(script.prompt, {
      kind: "survey",
      question: "companySize",
    });
  });

  it("asks the company size after the role, then the goal", () => {
    const afterRole = firstRunScript({
      ...survey,
      survey: record({ industry: "legal", role: "founder" }),
    });
    deepStrictEqual(tags(afterRole).slice(-2), ["r:industry", "r:role*"]);
    deepStrictEqual(afterRole.prompt, {
      kind: "survey",
      question: "companySize",
    });
    const afterSize = firstRunScript({
      ...survey,
      survey: record({
        industry: "legal",
        role: "founder",
        companySize: "solo",
      }),
    });
    deepStrictEqual(tags(afterSize).slice(-2), ["r:role", "r:companySize*"]);
    const size = afterSize.lines.at(-1);
    strictEqual(size?.kind === "receipt" && size.value, "solo");
    deepStrictEqual(afterSize.prompt, { kind: "survey", question: "goal" });
  });

  it("shows the person's own words for an answer outside the catalog", () => {
    const script = firstRunScript({
      ...survey,
      survey: record({
        industry: "something_else",
        industryOther: "Dog grooming",
        role: "something_else",
        roleOther: null,
      }),
    });
    const values = script.lines.flatMap((line) =>
      line.kind === "receipt" ? [line.value] : [],
    );
    deepStrictEqual(values.slice(-2), ["Dog grooming", "something_else"]);
  });

  it("a lost provider scan leaves the connection receipt blank, not missing", () => {
    const script = firstRunScript({ ...survey, providerId: null });
    const connected = script.lines[INTRO.length];
    strictEqual(connected.kind === "receipt" && connected.value, "");
  });
});

describe("firstRunScript: the team", () => {
  const team: FirstRunInput = {
    ...base,
    stage: "team",
    providerId: "openai",
    survey: answered,
  };

  it("introduces the team and hands the prompt to the team card", () => {
    const script = firstRunScript(team);
    deepStrictEqual(tags(script).slice(-2), ["r:goal*", "m:teamIntro"]);
    deepStrictEqual(script.prompt, { kind: "team" });
  });

  it("waits for the workspace the team is hired into", () => {
    deepStrictEqual(firstRunScript({ ...team, loading: true }).prompt, {
      kind: "wait",
    });
  });

  it("a resumed run names the AI Employees already hired", () => {
    const script = firstRunScript({ ...team, earlierHires: 2 });
    const resume = script.lines.at(-1);
    strictEqual(resume?.kind === "manager" && resume.count, 2);
  });

  it("the goal can still change before the team is answered", () => {
    const script = firstRunScript({ ...team, editing: "goal" });
    deepStrictEqual(script.prompt, { kind: "survey", question: "goal" });
    strictEqual(tags(script).includes("m:teamIntro"), false);
  });

  it("a team answer moves the change off the survey", () => {
    const more = teamAnswer(
      TEAM_CONVERSATION_START,
      { question: "teamNext", value: "another" },
      TEAM_CONVERSATION_START.view,
    );
    const script = firstRunScript({ ...team, team: more });
    deepStrictEqual(tags(script).slice(-3), [
      "r:goal",
      "m:teamIntro",
      "r:teamNext*",
    ]);
  });

  it("the team hired goes straight to the closing, and nothing before it can change", () => {
    const script = firstRunScript({ ...team, team: starterTeamHired() });
    const shown = tags(script);
    const intro = shown.indexOf("m:teamIntro");
    deepStrictEqual(shown.slice(intro - 1, intro + 3), [
      "r:goal",
      "m:teamIntro",
      "r:teamBasic",
      "m:closingTeam",
    ]);
    strictEqual(changeableAnswer(script.lines), null);
  });
});

const starterTeamHired = () =>
  teamFinished(TEAM_CONVERSATION_START, {
    question: "teamBasic",
    value: "Avery, Jordan and Riley",
  });

describe("firstRunScript: going back", () => {
  const team: FirstRunInput = {
    ...base,
    stage: "team",
    providerId: "openai",
    survey: answered,
  };

  it("on the starter team, the goal is the answer to go back to", () => {
    strictEqual(changeableAnswer(firstRunScript(team).lines)?.question, "goal");
  });

  it("a starter team reached through its industry goes back to the industry", () => {
    const viaIndustry = teamAnswer(
      { ...TEAM_CONVERSATION_START, view: { kind: "basicIndustry" } },
      { question: "teamIndustry", value: "legal" },
      { kind: "basic", viaIndustry: true },
    );
    const back = changeableAnswer(
      firstRunScript({ ...team, team: viaIndustry }).lines,
    );
    strictEqual(back?.question, "teamIndustry");
    deepStrictEqual(teamUndo(viaIndustry).view, { kind: "basicIndustry" });
  });

  it("a survey question goes back to the answer before it", () => {
    const script = firstRunScript({
      ...team,
      stage: "survey",
      survey: record({ industry: "legal" }),
    });
    strictEqual(changeableAnswer(script.lines)?.question, "industry");
  });

  it("the first survey question has nothing to go back to", () => {
    const script = firstRunScript({ ...team, stage: "survey", survey: null });
    strictEqual(changeableAnswer(script.lines), null);
  });
});

describe("firstRunScript: the closing", () => {
  const team: FirstRunInput = {
    ...base,
    stage: "team",
    providerId: "anthropic",
    survey: answered,
    team: starterTeamHired(),
  };
  const closingManager = (script: Script) =>
    script.lines.find(
      (line) => line.kind === "manager" && line.id === "closingTeam",
    );

  it("a finished team closes on the team card and leaves the goal to the real chat", () => {
    const script = firstRunScript(team);
    deepStrictEqual(tags(script).slice(-4), [
      "r:goal",
      "m:teamIntro",
      "r:teamBasic",
      "m:closingTeam",
    ]);
    deepStrictEqual(script.prompt, { kind: "openChat" });
  });

  it("where no manager is served, the team card promises nothing of the manager", () => {
    const script = firstRunScript({ ...team, reach: null });
    deepStrictEqual(tags(script).slice(-1), ["m:closingTeam"]);
    const card = closingManager(script);
    strictEqual(card?.kind === "manager" && card.reach, undefined);
    deepStrictEqual(script.prompt, { kind: "openChat" });
  });

  it("with the goal skipped, it asks for a task and hands over to the real chat", () => {
    const script = firstRunScript({
      ...team,
      survey: record({ ...answered, automationGoal: null, goalSkipped: true }),
    });
    deepStrictEqual(tags(script).slice(-2), ["m:closingTeam", "m:closingAsk"]);
    deepStrictEqual(script.prompt, { kind: "openChat" });
  });

  it("tells what the manager does as far as this deployment reaches", () => {
    const reach = { invite: true, connect: false };
    const line = closingManager(firstRunScript({ ...team, reach }));
    deepStrictEqual(line?.kind === "manager" && line.reach, reach);
  });

  it("never offers to invite teammates to someone who works alone", () => {
    const reach = { invite: true, connect: true };
    const alone = closingManager(
      firstRunScript({
        ...team,
        reach,
        survey: record({ ...answered, companySize: "solo" }),
      }),
    );
    deepStrictEqual(alone?.kind === "manager" && alone.reach, {
      invite: false,
      connect: true,
    });
    const skipped = closingManager(
      firstRunScript({
        ...team,
        reach,
        survey: record({ ...answered, companySize: "skipped" }),
      }),
    );
    deepStrictEqual(skipped?.kind === "manager" && skipped.reach, reach);
  });

  it("leaves nothing to go back to once it closes", () => {
    strictEqual(changeableAnswer(firstRunScript(team).lines), null);
  });

  it("leaves nothing to change once it closes", () => {
    for (const survey of [
      answered,
      record({ ...answered, automationGoal: null, goalSkipped: true }),
    ]) {
      const script = firstRunScript({
        ...team,
        survey,
        team: teamFinished(TEAM_CONVERSATION_START, null),
      });
      strictEqual(
        script.lines.some((line) => line.kind === "receipt" && line.editable),
        false,
      );
    }
  });
});

describe("profileScript", () => {
  it("asks only the questions it opened for", () => {
    const script = profileScript({
      plan: ["industry", "goal"],
      survey: record({ segment: "design" }),
      editing: null,
    });
    deepStrictEqual(tags(script), ["m:profileIntro"]);
    deepStrictEqual(script.prompt, { kind: "survey", question: "industry" });
  });

  it("thanks the person once the plan is answered", () => {
    const script = profileScript({
      plan: ["industry", "goal"],
      survey: answered,
      editing: null,
    });
    deepStrictEqual(tags(script), [
      "m:profileIntro",
      "r:industry",
      "r:goal",
      "m:profileThanks",
    ]);
    deepStrictEqual(script.prompt, { kind: "finish" });
  });

  it("asks an existing account only the company size it never answered", () => {
    const script = profileScript({
      plan: ["companySize"],
      survey: record({ ...answered, companySize: null }),
      editing: null,
    });
    deepStrictEqual(tags(script), ["m:profileIntro"]);
    deepStrictEqual(script.prompt, {
      kind: "survey",
      question: "companySize",
    });
  });

  it("the latest answer can change until the plan is answered", () => {
    const script = profileScript({
      plan: ["industry", "goal"],
      survey: record({ segment: "design", industry: "legal" }),
      editing: null,
    });
    deepStrictEqual(tags(script), ["m:profileIntro", "r:industry*"]);
  });
});
