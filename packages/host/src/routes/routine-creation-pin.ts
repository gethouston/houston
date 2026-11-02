import { canonicalProviderId } from "@houston/domain";
import type { NewRoutine } from "@houston/protocol";
import type { LiveTurnPin } from "./live-turn-pin";

const EFFORT_ORDER = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
type RoutineEffort = (typeof EFFORT_ORDER)[number];
type DefaultPin = { model: string; efforts: readonly RoutineEffort[] };

// Unattended runs use cheaper models so an expensive authoring chat does not set their cost.
const ROUTINE_DEFAULTS: Readonly<Record<string, DefaultPin>> = {
  anthropic: {
    model: "claude-sonnet-5-5",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
  "openai-codex": {
    model: "gpt-6.1-terra",
    // The verified subscription efforts in runtime/ai/codex-offered.ts are narrower than pi's catalog.
    efforts: ["low", "max"],
  },
};

export function routineCreationPin(
  input: NewRoutine,
  authoringPin?: LiveTurnPin,
): NewRoutine {
  const inherited = !input.provider ? authoringPin : undefined;
  const chosenProvider = input.provider || inherited?.provider;
  if (!chosenProvider) return input;
  const provider = canonicalProviderId(chosenProvider) ?? chosenProvider;
  const pin = {
    ...input,
    provider,
    model: input.model ?? inherited?.model,
    effort: input.effort ?? inherited?.effort,
  };
  const defaults = ROUTINE_DEFAULTS[provider];
  if (input.model || !defaults) return pin;
  const requested = pin.effort === "off" ? "none" : pin.effort;
  const knownEffort =
    EFFORT_ORDER.find((level) => level === requested) ?? "medium";
  const rank = EFFORT_ORDER.indexOf(knownEffort);
  // Equidistant efforts choose the cheaper, lower level.
  const effort = defaults.efforts.reduce<RoutineEffort>(
    (closest, level) =>
      Math.abs(EFFORT_ORDER.indexOf(level) - rank) <
      Math.abs(EFFORT_ORDER.indexOf(closest) - rank)
        ? level
        : closest,
    "low",
  );
  return { ...pin, model: defaults.model, effort };
}
