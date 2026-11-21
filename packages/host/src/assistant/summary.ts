import type { ApprovalArg } from "@houston/protocol/approval";
import type { AssistantOperation } from "./catalog";
import { hireSummary } from "./hire-summary";

const VALUE_LIMIT = 2000;

const LIST_LIMIT = 20;

const NOTHING = "none";
const EMPTY_LIST = "empty list";
const EMPTY_GROUP = "empty";
const PLACEHOLDERS = new Set([NOTHING, EMPTY_LIST, EMPTY_GROUP]);

const INLINE_LIMIT = 80;

function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase();
}

function asText(value: unknown): string {
  if (value === null) return NOTHING;
  if (
    typeof value === "string" &&
    (PLACEHOLDERS.has(value.trim()) || /^\s*".*"\s*$/s.test(value))
  )
    return JSON.stringify(value);
  return String(value);
}

function pathKey(key: string): string {
  return /[.\s"]/.test(key) ? JSON.stringify(key) : key;
}

function asSentence(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export interface ConfirmationSummary {
  title: string;
  detail?: string;
  args: ApprovalArg[];
}

export function approvalArgs(params: Record<string, unknown>): ApprovalArg[] {
  const args: ApprovalArg[] = [];
  const push = (name: string, text: string): void => {
    const long = text.length > INLINE_LIMIT || text.includes("\n");
    args.push(
      text.length <= VALUE_LIMIT || name === "seed.claudeMd"
        ? { name, value: text, long }
        : {
            name,
            value: text.slice(0, VALUE_LIMIT),
            long: true,
            truncated: text.length - VALUE_LIMIT,
          },
    );
  };
  const add = (name: string, value: unknown): void => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 0) push(name, EMPTY_LIST);
      else if (value.length > LIST_LIMIT) push(name, listBlock(value));
      else
        for (const [index, item] of value.entries())
          add(`${name} ${index + 1}`, item);
      return;
    }
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 0) push(name, EMPTY_GROUP);
      for (const [key, child] of entries) add(`${name}.${pathKey(key)}`, child);
      return;
    }
    push(name, asText(value));
  };
  for (const [name, value] of Object.entries(params)) add(name, value);
  return args;
}

function listBlock(items: readonly unknown[]): string {
  return items
    .map((item) =>
      item !== null && typeof item === "object"
        ? JSON.stringify(item)
        : asText(item),
    )
    .join("\n");
}

function englishBlock(arg: ApprovalArg): string {
  const cut =
    arg.truncated === undefined
      ? ""
      : `\n[and ${arg.truncated} more characters, all of which would be written]`;
  return `The exact ${humanize(arg.name)} is:\n${arg.value}${cut}`;
}

export function confirmationSummary(
  op: AssistantOperation,
  params: Record<string, unknown>,
): ConfirmationSummary {
  const args = approvalArgs(params);
  if (op.name === "createAgent") return hireSummary(args);
  const sentence = asSentence(op.description);
  if (args.length === 0) return { title: sentence, args };

  const short = args.filter((arg) => !arg.long);
  const long = args.filter((arg) => arg.long);
  const phrase = short
    .map((arg) => `${humanize(arg.name)} "${arg.value}"`)
    .join(", ");
  const title =
    short.length > 0
      ? sentence
        ? `${sentence} This affects ${phrase}.`
        : `Affects ${phrase}.`
      : sentence;
  const detail = long.map(englishBlock).join("\n\n");
  return detail ? { title, detail, args } : { title, args };
}
