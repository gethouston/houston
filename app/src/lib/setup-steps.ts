/**
 * The ordered first-run steps, split into the two phases the UI shows:
 *   Setup       — get the account ready: language, agreement, log in to the AI,
 *                 connect your apps.
 *   Onboarding  — put it to work: create your first agent, send your first email.
 *
 * Each phase numbers its own steps ("Setup · 2 of 5", "Onboarding · 1 of 2") so
 * the two phases read as distinct. The rotating Welcome hero and the unnumbered
 * framing/celebration screens (intro, setupReady, done) sit OUTSIDE this list.
 */
export const SETUP_STEPS = [
  "language",
  "agreement",
  "brain",
  "providerLogin",
  "tools",
  "meet",
  "email",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];
export type SetupSection = "setup" | "onboarding";

const SECTION_OF: Record<SetupStep, SetupSection> = {
  language: "setup",
  agreement: "setup",
  brain: "setup",
  providerLogin: "setup",
  tools: "setup",
  meet: "onboarding",
  email: "onboarding",
};

/** The section a step belongs to + its 1-based position WITHIN that section. */
export function stepSection(step: SetupStep): {
  section: SetupSection;
  current: number;
  total: number;
} {
  const section = SECTION_OF[step];
  const peers = SETUP_STEPS.filter((s) => SECTION_OF[s] === section);
  return { section, current: peers.indexOf(step) + 1, total: peers.length };
}
