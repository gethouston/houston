/**
 * The `@assistant` tag grammar, as the coverage gate reads it.
 *
 * ```
 * @assistant group:<slug>            the taxonomy bucket the operation lives in
 * @assistant confirm: <reason>       the caller must confirm first, and what
 *                                    the person loses if the call goes wrong
 * @assistant unconfirmed: <reason>   a mutation dispatches unasked, and why
 * @assistant hidden: <reason>        withheld from the assistant, and why
 * @assistant hands: <card>           the card that DOES reach a hidden
 *                                    operation, or `unreachable <why not>`
 * @assistant unroutable: <reason>    no route can be derived, and why
 * @assistant unschematized: <reason> the shapes stay free-form, and why
 * ```
 *
 * `confirm` and `unconfirmed:` are the two halves of one decision, so both
 * state their case in the tag itself rather than in prose above it — a
 * rationale a reader has to find in a paragraph is one the next author copies
 * a `confirm` without. A bare `confirm` parses, and the coverage gate then
 * refuses it (`confirm-unstated`).
 *
 * A reason runs to the END of its line, so a reason-bearing tag is the last tag
 * on the line it sits on (`group:agents hidden: returns a secret`), and an
 * operation that is both confirmed and hidden spells each on its own
 * `@assistant` line.
 * A reason that starts with `debt:` states that the operation SHOULD be
 * automatable and needs a refactor; the coverage report lists those apart.
 */

export interface AssistantDocs {
  description?: string;
  group?: string;
  params: Record<string, string>;
  confirm: boolean;
  confirmed?: string;
  hidden: boolean;
  hiddenReason?: string;
  handsCard?: string;
  unconfirmed?: string;
  unroutableReason?: string;
  unschematizedReason?: string;
  unknownTags: string[];
}

const REASON_KEYS = {
  confirm: "confirmed",
  hidden: "hiddenReason",
  hands: "handsCard",
  unconfirmed: "unconfirmed",
  unroutable: "unroutableReason",
  unschematized: "unschematizedReason",
} as const;

const FLAG_TAGS = new Set(["confirm", "hidden"]);

type ReasonTag = keyof typeof REASON_KEYS;

function isReasonTag(name: string): name is ReasonTag {
  return name in REASON_KEYS;
}

function cleanBlock(block: string): string[] {
  return block
    .replace(/^\s*\/\*\*/, "")
    .replace(/\*\/\s*$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*? ?/, "").trimEnd());
}

function parseTags(line: string, docs: AssistantDocs): void {
  let rest = line.trim();
  while (rest.length > 0) {
    const match = /^([a-z][a-z-]*)(:[ \t]*)?/.exec(rest);
    if (!match) {
      docs.unknownTags.push(rest.split(/\s+/)[0]);
      return;
    }
    const [whole, name, colon] = match;
    rest = rest.slice(whole.length);
    if (name === "group" && colon) {
      const slug = /^[a-z0-9-]*/.exec(rest)?.[0] ?? "";
      docs.group = slug;
      rest = rest.slice(slug.length).trimStart();
      continue;
    }
    if (name === "confirm" && !colon) {
      docs.confirm = true;
      rest = rest.trimStart();
      continue;
    }
    if (isReasonTag(name)) {
      if (name === "hidden") docs.hidden = true;
      if (name === "confirm") docs.confirm = true;
      const reason = colon ? rest.trim() : "";
      if (reason) docs[REASON_KEYS[name]] = reason;
      else if (!FLAG_TAGS.has(name)) docs.unknownTags.push(name);
      if (colon) return;
      rest = rest.trimStart();
      continue;
    }
    docs.unknownTags.push(colon ? `${name}:` : name);
    if (colon) return;
    rest = rest.trimStart();
  }
}

function parseParams(lines: readonly string[]): Record<string, string> {
  const params: Record<string, string> = {};
  let open: string | null = null;
  for (const line of lines) {
    const match = /^@param\s+([A-Za-z_$][\w$]*)\s+(.*)$/.exec(line.trim());
    if (match) {
      const [, name, rest] = match;
      open = name;
      params[name] = rest.trim();
      continue;
    }
    if (!open) continue;
    const continued = line.trim();
    if (!continued || continued.startsWith("@")) {
      open = null;
      continue;
    }
    params[open] = `${params[open]} ${continued}`.trim();
  }
  return params;
}

export function parseAssistantDocs(block?: string): AssistantDocs {
  const docs: AssistantDocs = {
    confirm: false,
    hidden: false,
    params: {},
    unknownTags: [],
  };
  if (!block) return docs;
  const lines = cleanBlock(block);
  const descriptionLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("@") || (line === "" && descriptionLines.length > 0)) {
      break;
    }
    if (line) descriptionLines.push(line.trim());
  }
  docs.description = descriptionLines.join(" ") || undefined;
  docs.params = parseParams(lines);
  for (const line of lines) {
    if (line.startsWith("@assistant"))
      parseTags(line.slice("@assistant".length), docs);
  }
  return docs;
}

export function leadingJsDoc(
  source: string,
  start: number,
): string | undefined {
  const prefix = source.slice(0, start);
  const opening = prefix.lastIndexOf("/**");
  if (opening < 0) return undefined;
  const candidate = prefix.slice(opening);
  return /\*\/\s*$/.test(candidate) ? candidate : undefined;
}

export function humanizeMethodName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}
