/**
 * The numbered first-run steps, grouped into the two phases the UI shows. A
 * "logical step" can span more than one screen (e.g. "Connect your AI" is the
 * pick screen + the login screen), and each phase numbers its own steps
 * ("Setup · 1 of 2", "Onboarding · 2 of 3").
 *
 * The language + agreement gates are pre-setup and carry NO step counter, and
 * the framing/celebration screens (intro, the success screens, the finished
 * chooser) sit outside this list too.
 */
export type SetupSection = "setup" | "onboarding";

const LOGICAL_STEPS: { section: SetupSection; screens: readonly string[] }[] = [
  { section: "setup", screens: ["brain", "providerLogin"] }, // Connect your AI
  { section: "setup", screens: ["tools"] }, // Connect your apps
  { section: "onboarding", screens: ["meet"] }, // Create your agent
  { section: "onboarding", screens: ["connectEmail"] }, // Connect your email
  { section: "onboarding", screens: ["emailChat"] }, // Send your first email
];

/**
 * The section + 1-based position of a screen WITHIN its section, or null for
 * screens that aren't numbered steps (gates, success screens).
 */
export function stepSection(
  screen: string,
): { section: SetupSection; current: number; total: number } | null {
  const step = LOGICAL_STEPS.find((s) => s.screens.includes(screen));
  if (!step) return null;
  const peers = LOGICAL_STEPS.filter((s) => s.section === step.section);
  return {
    section: step.section,
    current: peers.findIndex((s) => s.screens.includes(screen)) + 1,
    total: peers.length,
  };
}
