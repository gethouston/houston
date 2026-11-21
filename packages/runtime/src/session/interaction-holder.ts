import { AsyncLocalStorage } from "node:async_hooks";
import type {
  InteractionStep,
  PendingInteraction,
} from "@houston/runtime-client";
import { TurnFinishMarks } from "./turn-finish";

export type QuestionStep = Extract<InteractionStep, { kind: "question" }>;
export type QuestionOptions = NonNullable<QuestionStep["options"]>;
type SigninStep = Extract<InteractionStep, { kind: "signin" }>;
type ConnectStep = Extract<InteractionStep, { kind: "connect" }>;
type ProviderConnectStep = Extract<
  InteractionStep,
  { kind: "provider_connect" }
>;
type CredentialStep = Extract<InteractionStep, { kind: "credential" }>;
type HandsOnStep = Extract<InteractionStep, { kind: "hands_on" }>;
type PlanReadyStep = Extract<InteractionStep, { kind: "plan_ready" }>;
type SuggestReusableStep = Extract<
  InteractionStep,
  { kind: "suggest_reusable" }
>;
type SuggestActionsStep = Extract<InteractionStep, { kind: "suggest_actions" }>;

export interface InteractionHolder {
  readonly confirmations: QuestionStep[];
  readonly questions: QuestionStep[];
  readonly signin: SigninStep | undefined;
  readonly connects: ConnectStep[];
  readonly providerConnects: ProviderConnectStep[];
  readonly credentials: CredentialStep[];
  readonly handsOn: HandsOnStep[];
  readonly planReady: PlanReadyStep | undefined;
  readonly suggestReusable: SuggestReusableStep | undefined;
  readonly suggestActions: SuggestActionsStep | undefined;
  readonly finish: TurnFinishMarks;
  readonly pending: PendingInteraction | undefined;
}

export class MutableInteractionHolder implements InteractionHolder {
  readonly confirmations: QuestionStep[] = [];
  readonly questions: QuestionStep[] = [];
  signin: SigninStep | undefined;
  readonly connects: ConnectStep[] = [];
  readonly providerConnects: ProviderConnectStep[] = [];
  readonly credentials: CredentialStep[] = [];
  readonly handsOn: HandsOnStep[] = [];
  planReady: PlanReadyStep | undefined;
  suggestReusable: SuggestReusableStep | undefined;
  suggestActions: SuggestActionsStep | undefined;
  readonly finish = new TurnFinishMarks();

  get pending(): PendingInteraction | undefined {
    if (this.planReady) return { steps: [this.planReady] };
    const steps = [
      ...this.confirmations,
      ...this.questions,
      ...(this.signin ? [this.signin] : []),
      ...this.connects,
      ...this.credentials,
      ...this.providerConnects,
      ...this.handsOn,
    ];
    if (steps.length > 0) return { steps };
    const suggestions = [
      ...(this.suggestActions ? [this.suggestActions] : []),
      ...(this.suggestReusable ? [this.suggestReusable] : []),
    ];
    if (suggestions.length) return { steps: suggestions };
    return undefined;
  }
}

const store = new AsyncLocalStorage<MutableInteractionHolder>();

export function newInteractionHolder(): InteractionHolder {
  return new MutableInteractionHolder();
}

export function runWithInteractionCapture<T>(
  holder: InteractionHolder,
  fn: () => T,
): T {
  return store.run(holder as MutableInteractionHolder, fn);
}

export function currentInteractionHolder():
  | MutableInteractionHolder
  | undefined {
  return store.getStore();
}

export function currentTurnFinish(): TurnFinishMarks | undefined {
  return store.getStore()?.finish;
}
