export type StartChoice = "know" | "template";

export type WakeChoice = "schedule" | "trigger" | "webhook";

export type IntakePhase =
  | "fork"
  | "wake"
  | "schedule"
  | "trigger"
  | "webhook"
  | "template";

export function forkDestination(
  choice: StartChoice | null,
  triggersAvailable: boolean,
): IntakePhase | "aiLed" {
  if (choice === null) return "aiLed";
  if (choice === "template") return "template";
  return triggersAvailable ? "wake" : "schedule";
}

export function wakeDestination(
  choice: WakeChoice | null,
): IntakePhase | "aiLed" {
  return choice === null ? "aiLed" : choice;
}

export function pickedOptionId(
  options: { id: string; label: string }[],
  answers: { answer: string }[],
): string | null {
  const answer = answers[0]?.answer;
  if (answer === undefined) return null;
  return options.find((o) => o.label === answer)?.id ?? null;
}
