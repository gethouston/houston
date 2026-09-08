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
type CredentialStep = Extract<InteractionStep, { kind: "credential" }>;
type PlanReadyStep = Extract<InteractionStep, { kind: "plan_ready" }>;
type SuggestReusableStep = Extract<
  InteractionStep,
  { kind: "suggest_reusable" }
>;
type SuggestActionsStep = Extract<InteractionStep, { kind: "suggest_actions" }>;

export interface InteractionHolder {
  /** Approval cards the RUNTIME raised for destructive Houston operations
   *  (`confirm-gate.ts`), ids `x1`..`xN`. They are question steps on the wire so
   *  every surface renders them today, but they are NOT the model's questions:
   *  `ask_user`'s replace semantics must never be able to erase one, and they
   *  lead the sequence because a delete outranks anything the model wanted to
   *  ask alongside it. Deduped by the host-issued `requestId`, never by the
   *  question text: one request, one card. */
  readonly confirmations: QuestionStep[];
  /** Question steps from the last `ask_user` call this turn (replace semantics). */
  readonly questions: QuestionStep[];
  /** The single signin step, once the host reported the user must sign in. */
  readonly signin: SigninStep | undefined;
  /** Connect steps appended by `request_connection`, deduped by toolkit. */
  readonly connects: ConnectStep[];
  /** Credential steps appended by `request_credential` (custom integrations),
   *  deduped by toolkit — the user enters the secret in a secure card. */
  readonly credentials: CredentialStep[];
  /** The single plan-ready step, once the model called `plan_ready` (plan mode
   *  only). When set it OWNS the interaction exclusively — see {@link pending}. */
  readonly planReady: PlanReadyStep | undefined;
  /** The single optional save offer (id `r1`) for a cleanly completed mission.
   *  It can coexist with {@link suggestActions}; blocking steps take priority.
   *  See {@link pending}. */
  readonly suggestReusable: SuggestReusableStep | undefined;
  /** Optional concrete next-step bubbles for a cleanly completed mission. */
  readonly suggestActions: SuggestActionsStep | undefined;
  /** The marks the turn's finish is decided on (closing message written, turn
   *  ended by a tool) — fed by the turn executor from the backend's message
   *  boundaries and the wire stream's text. */
  readonly finish: TurnFinishMarks;
  /** The recorded sequence — question steps, then the signin step, then connect
   *  steps — or undefined when the model asked for nothing this turn. Derived:
   *  read after prompt(). */
  readonly pending: PendingInteraction | undefined;
}

/**
 * The writable face of the holder: the `record*` modules mutate this, while the
 * turn that started the capture only ever reads back the {@link InteractionHolder}
 * contract.
 */
export class MutableInteractionHolder implements InteractionHolder {
  readonly confirmations: QuestionStep[] = [];
  readonly questions: QuestionStep[] = [];
  signin: SigninStep | undefined;
  readonly connects: ConnectStep[] = [];
  readonly credentials: CredentialStep[] = [];
  planReady: PlanReadyStep | undefined;
  suggestReusable: SuggestReusableStep | undefined;
  suggestActions: SuggestActionsStep | undefined;
  readonly finish = new TurnFinishMarks();

  get pending(): PendingInteraction | undefined {
    // A plan-ready step is exclusive: the plan-mode overlay tells the model to
    // call `plan_ready` ALONE (and the tool subset withholds the ways to act),
    // so if it somehow also queued questions/signin/connects this turn, the plan
    // card still wins. Defensive normalization — one card, one meaning.
    if (this.planReady) return { steps: [this.planReady] };
    const steps = [
      ...this.confirmations,
      ...this.questions,
      ...(this.signin ? [this.signin] : []),
      ...this.connects,
      // Credentials sit with connects (entering a key is a form of connecting).
      ...this.credentials,
    ];
    if (steps.length > 0) return { steps };
    // Optional offers may compose on the clean frame. Actions render first,
    // then the reusable reflection card, so both stay visible without blocking.
    const suggestions = [
      ...(this.suggestActions ? [this.suggestActions] : []),
      ...(this.suggestReusable ? [this.suggestReusable] : []),
    ];
    if (suggestions.length) return { steps: suggestions };
    return undefined;
  }
}

const store = new AsyncLocalStorage<MutableInteractionHolder>();

/** A fresh, empty holder for a new turn. */
export function newInteractionHolder(): InteractionHolder {
  return new MutableInteractionHolder();
}

/** Run `fn` with `holder` as the ambient interaction holder for its async subtree. */
export function runWithInteractionCapture<T>(
  holder: InteractionHolder,
  fn: () => T,
): T {
  return store.run(holder as MutableInteractionHolder, fn);
}

/**
 * This turn's holder, or undefined when there is no turn in scope — that is what
 * makes every `record*` call a silent no-op outside a turn.
 */
export function currentInteractionHolder():
  | MutableInteractionHolder
  | undefined {
  return store.getStore();
}

/**
 * This turn's finish marks, for the tool now executing (and the Claude
 * backend's PostToolBatch hook, which runs on the same per-turn scope).
 * Undefined outside a turn, where nothing can end.
 */
export function currentTurnFinish(): TurnFinishMarks | undefined {
  return store.getStore()?.finish;
}
