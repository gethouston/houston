import type { ApprovalArg } from "@houston/protocol/approval";
import type { InteractionStep } from "@houston/protocol/interaction";
import type {
  ChatInteractionOption,
  ChatInteractionStep,
} from "@houston-ai/chat";

/**
 * An approval card, said in the READER's language.
 *
 * The host decides WHAT is being approved and sends it structurally (the
 * operation name plus the exact arguments — `packages/host/src/assistant/
 * summary.ts`); this decides how that reads. Splitting it this way is the only
 * way both halves can be true at once: a sentence authored in the host could
 * only ever be authored in one language, and a person cannot approve what they
 * cannot read.
 *
 * Nothing here invents content. Argument VALUES are rendered verbatim, exactly
 * as the host sent them; only the connective copy, the operation's sentence and
 * the argument NAMES come from the locale. With no structure to work from (an
 * older host, an operation this build has no sentence for) the host's own
 * English wording is shown rather than nothing.
 */

type QuestionStep = Extract<InteractionStep, { kind: "question" }>;
type ChatQuestionStep = Extract<ChatInteractionStep, { kind: "question" }>;

/** Every piece of card copy the reader's locale owns. Built from `t()` by
 *  `hooks/use-approval-card-copy.ts`; passed in so this module stays pure. */
export interface ApprovalCardCopy {
  approve: string;
  decline: string;
  /** The question the buttons answer, appended to every approval card. */
  closing: string;
  /** "This affects agent "Dobby"." */
  affects: (args: string) => string;
  /** One argument as the sentence names it: `agent "Dobby"`. */
  argument: (name: string, value: string) => string;
  /** The heading over one long argument's own block. */
  exactValue: (name: string) => string;
  /** What was cut off the end of a value too long to show whole. */
  truncated: (count: number) => string;
  /** What this operation would do, or undefined when this build has no
   *  sentence for it (a host newer than the app). */
  sentence: (operation: string) => string | undefined;
  /** The parameter named the way a person would say it. */
  argumentName: (operation: string, param: string) => string;
}

/** A value the host sent, structurally sound. Anything else is not rendered as
 *  an argument: a card must never show a shape it cannot read. */
const isArg = (value: unknown): value is ApprovalArg =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ApprovalArg).name === "string" &&
  typeof (value as ApprovalArg).value === "string";

/** One long argument, under its own heading, verbatim. */
function block(arg: ApprovalArg, name: string, copy: ApprovalCardCopy): string {
  const cut =
    arg.truncated === undefined ? "" : `\n${copy.truncated(arg.truncated)}`;
  return `${copy.exactValue(name)}\n${arg.value}${cut}`;
}

/**
 * The card the user reads, in their own language.
 *
 * The structural account is trusted ONLY next to a live `requestId`: the host
 * strips both from any step whose id it did not issue, so a runtime that writes
 * an `approval` block into an activity file cannot have it rendered as one.
 */
export function localizeApprovalQuestion(
  step: QuestionStep,
  copy: ApprovalCardCopy,
): ChatQuestionStep {
  // ONLY the two answers survive as approval controls. An approval option
  // carrying any other id mints no receipt (`lib/interaction-approvals.ts`), so
  // rendering it would put a button on a safety card that decides nothing —
  // and labelling it from this map is how an id like "closing" once became one.
  const options: ChatInteractionOption[] | undefined =
    step.options?.flatMap<ChatInteractionOption>((option) => {
      if (option.kind !== "approval") return [option];
      if (option.id === "approve") return [{ ...option, label: copy.approve }];
      if (option.id === "decline") return [{ ...option, label: copy.decline }];
      return [];
    });
  const isApproval =
    step.requestId !== undefined &&
    step.options?.some((option) => option.kind === "approval") === true;
  if (!isApproval) return { ...step, options };

  const operation = step.approval?.operation;
  const sentence =
    operation === undefined ? undefined : copy.sentence(operation);
  if (operation === undefined || sentence === undefined)
    // No sentence of our own: the host's English wording is what the person
    // reads, which is still the exact call they are being asked about.
    return { ...step, question: `${step.question} ${copy.closing}`, options };

  const args = (step.approval?.args ?? []).filter(isArg);
  const named = (arg: ApprovalArg) => copy.argumentName(operation, arg.name);
  const inline = args
    .filter((arg) => !arg.long)
    .map((arg) => copy.argument(named(arg), arg.value))
    .join(", ");
  const detail = args
    .filter((arg) => arg.long)
    .map((arg) => block(arg, named(arg), copy))
    .join("\n\n");
  // The host's English block is dropped, not merged: the same arguments are
  // being re-rendered here, and two accounts of one call is one too many.
  const { detail: _english, ...rest } = step;
  return {
    ...rest,
    question: [sentence, inline ? copy.affects(inline) : "", copy.closing]
      .filter(Boolean)
      .join(" "),
    ...(detail ? { detail } : {}),
    options,
  };
}
