import type {
  InteractionStep,
  PendingInteraction,
  SuggestionStep,
} from "./interaction-types";

export type {
  HandsOnSurface,
  InteractionOption,
  InteractionStep,
  PendingInteraction,
  SuggestionStep,
} from "./interaction-types";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export const isInteractionStep = (v: unknown): v is InteractionStep => {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.kind === "question")
    return (
      typeof v.question === "string" &&
      (v.detail === undefined || typeof v.detail === "string") &&
      (v.toolkit === undefined || typeof v.toolkit === "string") &&
      (v.wantsFiles === undefined || typeof v.wantsFiles === "boolean") &&
      (v.requestId === undefined || typeof v.requestId === "string")
    );
  if (v.kind === "signin")
    return v.reason === undefined || typeof v.reason === "string";
  if (v.kind === "connect")
    return (
      typeof v.toolkit === "string" &&
      (v.reconnect === undefined || typeof v.reconnect === "boolean") &&
      (v.refusedAt === undefined || typeof v.refusedAt === "string")
    );
  if (v.kind === "provider_connect")
    return (
      typeof v.provider === "string" &&
      v.provider.trim().length > 0 &&
      (v.reason === undefined || typeof v.reason === "string")
    );
  if (v.kind === "credential") return typeof v.toolkit === "string";
  if (v.kind === "hands_on")
    return (
      typeof v.surface === "string" &&
      v.surface.length > 0 &&
      (v.agentId === undefined ||
        (typeof v.agentId === "string" && v.agentId.length > 0)) &&
      (v.reason === undefined || typeof v.reason === "string")
    );
  if (v.kind === "plan_ready") return typeof v.summary === "string";
  if (v.kind === "suggest_reusable")
    return (
      (v.reusableKind === "skill" ||
        v.reusableKind === "routine" ||
        v.reusableKind === "learning") &&
      typeof v.title === "string" &&
      typeof v.rationale === "string"
    );
  if (v.kind === "suggest_actions")
    return (
      Array.isArray(v.actions) &&
      v.actions.length >= 2 &&
      v.actions.length <= 4 &&
      v.actions.every(
        (action) =>
          isRecord(action) &&
          typeof action.id === "string" &&
          typeof action.label === "string" &&
          typeof action.message === "string",
      )
    );
  return false;
};

export const parsePendingInteraction = (
  v: unknown,
): PendingInteraction | undefined => {
  if (!isRecord(v) || !Array.isArray(v.steps)) return undefined;
  const steps = v.steps.filter(isInteractionStep);
  return steps.length > 0 ? { steps } : undefined;
};

export const isPendingInteraction = (v: unknown): v is PendingInteraction =>
  parsePendingInteraction(v) !== undefined;

export const isSuggestionStep = (
  step: InteractionStep,
): step is SuggestionStep =>
  step.kind === "suggest_actions" || step.kind === "suggest_reusable";

export const hasOnlySuggestionSteps = (steps: InteractionStep[]): boolean =>
  steps.length > 0 && steps.every(isSuggestionStep);

export const retainSuggestionSteps = (
  v: unknown,
): PendingInteraction | undefined => {
  const parsed = parsePendingInteraction(v);
  if (!parsed) return undefined;
  const steps = parsed.steps.filter(isSuggestionStep);
  return steps.length > 0 ? { steps } : undefined;
};

export type InteractionPatchOutcome =
  | { kind: "set"; interaction: PendingInteraction }
  | { kind: "clear" }
  | { kind: "keep" };

export const resolveInteractionPatch = (args: {
  patched: unknown;
  stored: unknown;
  status: string | undefined;
}): InteractionPatchOutcome => {
  const { patched, stored, status } = args;
  if (patched === null) return { kind: "clear" };
  if (patched !== undefined && isPendingInteraction(patched))
    return { kind: "set", interaction: patched };
  if (status !== "done") return { kind: "keep" };
  const kept = retainSuggestionSteps(stored);
  return kept ? { kind: "set", interaction: kept } : { kind: "clear" };
};
