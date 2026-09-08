/**
 * The `@assistant` tag grammar, as the coverage gate reads it.
 *
 * ```
 * @assistant group:<slug>            the taxonomy bucket the operation lives in
 * @assistant confirm                 the caller must confirm before dispatching
 * @assistant hidden: <reason>        withheld from the assistant, and why
 * @assistant unroutable: <reason>    no route can be derived, and why
 * @assistant unschematized: <reason> the shapes stay free-form, and why
 * ```
 *
 * A reason runs to the END of its line, so a reason-bearing tag is the last tag
 * on the line it sits on (`group:agents confirm hidden: returns a secret`).
 * A reason that starts with `debt:` states that the operation SHOULD be
 * automatable and needs a refactor; the coverage report lists those apart.
 */

export interface AssistantDocs {
  description?: string;
  group?: string;
  confirm: boolean;
  hidden: boolean;
  hiddenReason?: string;
  unroutableReason?: string;
  unschematizedReason?: string;
  /** Tags the grammar does not define — a typo, or a reason left off. */
  unknownTags: string[];
}

const REASON_KEYS = {
  hidden: "hiddenReason",
  unroutable: "unroutableReason",
  unschematized: "unschematizedReason",
} as const;

type ReasonTag = keyof typeof REASON_KEYS;

function isReasonTag(name: string): name is ReasonTag {
  return name in REASON_KEYS;
}

function cleanBlock(block: string): string[] {
  return block
    .replace(/^\s*\/\*\*/, "")
    .replace(/\*\/\s*$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\* ?/, "").trimEnd());
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
      // The reason is the rest of the line: anything after it would be read as
      // part of the prose, so a reason-bearing tag ends its line.
      const reason = colon ? rest.trim() : "";
      if (reason) docs[REASON_KEYS[name]] = reason;
      // A bare `unroutable`/`unschematized` asserts nothing; only `hidden`
      // carries meaning without a reason (and the gate then rejects it).
      else if (name !== "hidden") docs.unknownTags.push(name);
      if (colon) return;
      rest = rest.trimStart();
      continue;
    }
    docs.unknownTags.push(colon ? `${name}:` : name);
    if (colon) return;
    rest = rest.trimStart();
  }
}

export function parseAssistantDocs(block?: string): AssistantDocs {
  const docs: AssistantDocs = {
    confirm: false,
    hidden: false,
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
