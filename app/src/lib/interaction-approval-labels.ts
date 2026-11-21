import type { ApprovalArg } from "@houston/protocol/approval";
import type { InteractionStep } from "@houston/protocol/interaction";
import type {
  ChatInteractionOption,
  ChatInteractionStep,
} from "@houston-ai/chat";
import {
  refusesPurchaseApproval,
  storeRefusalQuestion,
} from "./purchase-approval";

type QuestionStep = Extract<InteractionStep, { kind: "question" }>;

export const MACHINE_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  addOrgMember: ["prorationDate", "quotedAmountCents"],
  updateActivity: ["stamp"],
};
type ChatQuestionStep = Extract<ChatInteractionStep, { kind: "question" }>;

export interface ApprovalCardCopy {
  approve: string;
  decline: string;
  closing: string;
  affects: (args: string) => string;
  argument: (name: string, value: string) => string;
  exactValue: (name: string) => string;
  truncated: (count: number) => string;
  sentence: (operation: string) => string | undefined;
  argumentName: (operation: string, param: string) => string;
  hire: (name: string) => string;
  instructionsLabel: string;
  storeRefusal: string;
  storeRefusalOk: string;
}

function hireInstructions(source: string): { role?: string; body: string } {
  const frontmatter = source.match(
    /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/,
  );
  if (!frontmatter) return { body: source.trim() };
  const role = frontmatter[1]
    ?.split(/\r?\n/)
    .find((line) => /^role\s*:/i.test(line))
    ?.replace(/^role\s*:\s*/i, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return {
    ...(role ? { role } : {}),
    body: source.slice(frontmatter[0].length).trim(),
  };
}

const isArg = (value: unknown): value is ApprovalArg =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ApprovalArg).name === "string" &&
  typeof (value as ApprovalArg).value === "string";

function block(arg: ApprovalArg, name: string, copy: ApprovalCardCopy): string {
  const cut =
    arg.truncated === undefined ? "" : `\n${copy.truncated(arg.truncated)}`;
  return `${copy.exactValue(name)}\n${arg.value}${cut}`;
}

export function localizeApprovalQuestion(
  step: QuestionStep,
  copy: ApprovalCardCopy,
): ChatQuestionStep {
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
  if (refusesPurchaseApproval(operation))
    return storeRefusalQuestion(step, options, copy);
  const sentence =
    operation === undefined ? undefined : copy.sentence(operation);
  if (operation === undefined || sentence === undefined)
    return { ...step, question: `${step.question} ${copy.closing}`, options };

  const args = (step.approval?.args ?? [])
    .filter(isArg)
    .filter((arg) => !MACHINE_ARGUMENTS[operation]?.includes(arg.name));
  if (operation === "createAgent") {
    const name = args.find((arg) => arg.name === "name")?.value;
    const color = args.find((arg) => arg.name === "color")?.value;
    const source = args.find((arg) => arg.name === "seed.claudeMd")?.value;
    if (name) {
      const { detail: _english, approval: _approval, ...rest } = step;
      const instructions = source ? hireInstructions(source) : undefined;
      return {
        ...rest,
        question: copy.hire(name),
        ...(color || instructions?.role || instructions?.body
          ? {
              hire: {
                ...(color ? { color } : {}),
                ...(instructions?.role ? { role: instructions.role } : {}),
                ...(instructions?.body
                  ? {
                      instructions: instructions.body,
                      instructionsLabel: copy.instructionsLabel,
                    }
                  : {}),
              },
            }
          : {}),
        options,
      };
    }
  }
  const named = (arg: ApprovalArg) => copy.argumentName(operation, arg.name);
  const inline = args
    .filter((arg) => !arg.long)
    .map((arg) => copy.argument(named(arg), arg.value))
    .join(", ");
  const detail = args
    .filter((arg) => arg.long)
    .map((arg) => block(arg, named(arg), copy))
    .join("\n\n");
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
