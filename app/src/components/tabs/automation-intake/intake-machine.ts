/**
 * The intake's phase machine — pure and DOM-free so the node:test suite can
 * drive it. AutomationIntake renders ONE scripted card per phase (a question
 * card or a re-hosted detail card); these functions decide which phase a card's
 * answer leads to. "aiLed" means the user skipped: the intake completes with
 * nothing and the AI runs the full interview in chat.
 */

/** The fork answer: the user knows what they want, or wants a template. */
export type StartChoice = "know" | "template";

/** The wake answer on the "know what I want" path. */
export type WakeChoice = "schedule" | "trigger" | "webhook";

/** The card the intake is currently showing. */
export type IntakePhase =
  | "fork"
  | "wake"
  | "schedule"
  | "trigger"
  | "webhook"
  | "template";

/** Where the fork answer leads. `null` (the user skipped the question) resolves
 *  to "aiLed" — complete with nothing, the AI interviews from scratch. Picking
 *  "know" jumps straight to the schedule card where the deployment has no event
 *  triggers (the wake question would have only one option). */
export function forkDestination(
  choice: StartChoice | null,
  triggersAvailable: boolean,
): IntakePhase | "aiLed" {
  if (choice === null) return "aiLed";
  if (choice === "template") return "template";
  return triggersAvailable ? "wake" : "schedule";
}

/** Where the wake answer leads. `null` (skipped) resolves to "aiLed"; otherwise
 *  the chosen wake IS the next detail card. */
export function wakeDestination(
  choice: WakeChoice | null,
): IntakePhase | "aiLed" {
  return choice === null ? "aiLed" : choice;
}

/** The option id a single-question card resolved to, from the completed answers
 *  a {@link ChatInteractionCard} hands back — matched by the answer's label. An
 *  empty answers array (the user skipped the question) yields `null`. Structural
 *  option/answer shapes keep this module free of the ui/chat (React) package. */
export function pickedOptionId(
  options: { id: string; label: string }[],
  answers: { answer: string }[],
): string | null {
  const answer = answers[0]?.answer;
  if (answer === undefined) return null;
  return options.find((o) => o.label === answer)?.id ?? null;
}
