import type { AssistantOperation } from "./catalog";

/**
 * The wording on an approval card, authored HERE from the catalog and the exact
 * arguments the operation would run with, never by the model. That is the whole
 * point: a model that could author the question could describe a rename and
 * perform a delete, and the user would have approved the rename.
 *
 * It is authored in the HOST because the host is what issues the receipt the
 * approval becomes (`approvals.ts`) — one place decides both, so the sentence a
 * person read and the bytes their yes authorizes can never drift apart.
 *
 * Arguments are shown IN FULL. A value the user cannot see is a value they did
 * not approve, so nothing is quietly shortened: a long or multi-line value
 * moves out of the sentence into {@link ConfirmationSummary.detail}, which the
 * card renders as its own scrollable block, and the only case that is not shown
 * whole ({@link VALUE_LIMIT}) says so in words, with the exact number of
 * characters still to come.
 */

/** The longest single value shown whole. Past it the card says what it hid. */
const VALUE_LIMIT = 2000;

/** `agentPath` -> `agent path`: the argument named the way a person would. */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

/** One value as text: strings verbatim, everything else as its JSON. */
function asText(value: unknown): string {
  return value === null || typeof value !== "object"
    ? String(value)
    : JSON.stringify(value, null, 2);
}

/**
 * A value shown whole, or (only past {@link VALUE_LIMIT}) its beginning
 * followed by a plain statement of how much more there is. Never a bare "...":
 * the user must be able to tell that they are looking at part of something.
 */
function showValue(value: unknown): string {
  const text = asText(value);
  if (text.length <= VALUE_LIMIT) return text;
  const hidden = text.length - VALUE_LIMIT;
  return `${text.slice(0, VALUE_LIMIT)}\n[and ${hidden.toLocaleString("en-US")} more characters, all of which would be written]`;
}

const isShort = (value: unknown): boolean => {
  const text = asText(value);
  return text.length <= 80 && !text.includes("\n");
};

/** The catalog's description, guaranteed to end a sentence. */
function asSentence(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** What one approval card says: a sentence to read, and the exact material it
 *  is about when that material is too big to sit inside a sentence. */
export interface ConfirmationSummary {
  /** One line, always present: what this call would do and what it affects. */
  title: string;
  /** The long or multi-line arguments, verbatim, each under its own label.
   *  Absent when every argument fits in the title. */
  detail?: string;
}

/**
 * The plain-language account of what this exact call would do: the operation's
 * own description, then every argument it would act on. No operation names, no
 * parameter syntax, nothing the user has to be technical to read.
 *
 * Short arguments read as one sentence ("This affects agent path
 * "Personal/Dobby""); anything long or multi-line moves to `detail`, so a
 * file's contents are read as contents rather than crammed into a sentence.
 */
export function confirmationSummary(
  op: AssistantOperation,
  params: Record<string, unknown>,
): ConfirmationSummary {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  const sentence = asSentence(op.description);
  if (entries.length === 0) return { title: sentence };

  const short = entries.filter(([, value]) => isShort(value));
  const long = entries.filter(([, value]) => !isShort(value));
  const phrase = short
    .map(([key, value]) => `${humanize(key)} "${asText(value)}"`)
    .join(", ");
  const title =
    short.length > 0
      ? sentence
        ? `${sentence} This affects ${phrase}.`
        : `Affects ${phrase}.`
      : sentence;
  const detail = long
    .map(
      ([key, value]) => `The exact ${humanize(key)} is:\n${showValue(value)}`,
    )
    .join("\n\n");
  return detail ? { title, detail } : { title };
}
