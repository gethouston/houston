import type { AgentColorId } from "@houston-ai/core";
import type { SupportedLocale } from "../locale.ts";
import type { OnboardingCompanySize } from "../onboarding-company-size.ts";

export interface HandoffEmployee {
  name: string;
  role?: string;
}

export interface HandoffAbout {
  industry: string | null;
  role: string | null;
  companySize: OnboardingCompanySize | null;
}

export interface HandoffInput {
  goal: string;
  about: HandoffAbout;
  team: readonly HandoffEmployee[];
  freeColor: AgentColorId;
  locale: SupportedLocale;
}

const LANGUAGE: Record<SupportedLocale, string> = {
  en: "English",
  es: "Latin American Spanish, addressing the person as tú",
  pt: "Brazilian Portuguese, addressing the person as você",
};

const COMPANY_SIZE: Record<OnboardingCompanySize, string> = {
  solo: "just them, they work on their own",
  "2_10": "2 to 10 people",
  "11_50": "11 to 50 people",
  "51_200": "51 to 200 people",
  "201_1000": "201 to 1,000 people",
  "1000_plus": "more than 1,000 people",
};

function aboutSection({
  industry,
  role,
  companySize,
}: HandoffAbout): string | null {
  const facts = [
    ...(industry === null ? [] : [`- Industry: ${industry}`]),
    ...(role === null ? [] : [`- Role: ${role}`]),
    ...(companySize === null
      ? []
      : [`- Company size: ${COMPANY_SIZE[companySize]}`]),
  ];
  return facts.length > 0 ? `About them:\n${facts.join("\n")}` : null;
}

function rosterLine({ name, role }: HandoffEmployee): string {
  return role ? `- ${name} (${role})` : `- ${name}`;
}

const WORK_SILENTLY =
  "Work silently: the app shows the person each step as a card, so write no messages while you work and none after the mission starts. No narration, chatter or questions. Do not ask for confirmation. If hiring or starting the mission fails and you cannot fix it, say so plainly in one sentence and stop. Never quote a raw error or mention files, JSON, or configuration to the person.";

export function handoffPrompt({
  goal,
  about,
  team,
  freeColor,
  locale,
}: HandoffInput): string {
  const roster =
    team.length > 0
      ? team.map(rosterLine).join("\n")
      : "- None yet: they have not hired anyone.";
  const person = aboutSection(about);
  return [
    `[Written by the app, not typed by the person: they just finished onboarding with you. They asked for this goal, and hiring one new AI Employee for it is already approved by them.]`,
    `Their goal, in their own words: "${goal}"`,
    ...(person === null ? [] : [person]),
    `Their AI Employees:\n${roster}`,
    [
      "Get the goal started now:",
      "1. If an AI Employee already on their team clearly fits the goal, use that employee.",
      `2. Otherwise, hire one tailor-made AI Employee with createAgent using only name (a clear human job title), color "${freeColor}", and seed.claudeMd (a one-line role and full working instructions written specifically for this goal and the person's industry, role and company size above). The hire is already approved.`,
      "3. Start the mission on that employee's board with start_mission. Give the mission a complete brief built from the goal.",
    ].join("\n"),
    WORK_SILENTLY,
    `Reply in ${LANGUAGE[locale]}.`,
  ].join("\n\n");
}

export function goalRetryPrompt({
  goal,
  locale,
}: Pick<HandoffInput, "goal" | "locale">): string {
  return [
    "[Written by the app, not typed by the person: getting their goal started did not finish, and they pressed Try again. Hiring one new AI Employee for it is still approved by them.]",
    `Their goal, in their own words: "${goal}"`,
    "Get it started again: use the AI Employee you already hired for it, or one on their team that clearly fits; otherwise hire one tailor-made AI Employee with createAgent, as before. Then start the mission on that employee's board with start_mission, with a complete brief built from the goal.",
    WORK_SILENTLY,
    `Reply in ${LANGUAGE[locale]}.`,
  ].join("\n\n");
}
