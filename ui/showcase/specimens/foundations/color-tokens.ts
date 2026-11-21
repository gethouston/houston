import semanticColors from "../../../../packages/design-tokens/tokens/semantic/color.light.json";

import { COLOR_VOCABULARY } from "./color-vocabulary";

export interface ColorToken {
  name: string;
  variable: string;
  label: string;
  role: string;
}

export interface ColorTokenGroup {
  title: string;
  note: string;
  tokens: readonly ColorToken[];
}

type TokenNode = { $value?: unknown } & Record<string, unknown>;

function flatten(node: TokenNode, prefix: string[] = []): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$") || typeof value !== "object" || value === null)
      continue;
    const child = value as TokenNode;
    const path = [...prefix, key];
    if ("$value" in child) found.push(path.join("-"));
    else found.push(...flatten(child, path));
  }
  return found;
}

export const COLOR_TOKEN_NAMES: readonly string[] = flatten(
  (semanticColors as { ht: TokenNode }).ht,
);

const BLOCKS: readonly {
  title: string;
  note: string;
  names?: readonly string[];
  prefixes?: readonly string[];
}[] = [
  {
    title: "Canvas & surfaces",
    note: "The surface ladder, bottom to top. Depth is a step on this ladder plus a hairline — never a drop shadow.",
    names: [
      "base",
      "background",
      "input",
      "card",
      "card-hover",
      "card-solid",
      "popover",
      "dialog",
    ],
  },
  {
    title: "Text (ink)",
    note: "Two ink roles carry the whole product, plus one per surface that sets its own contrast.",
    names: ["ink", "ink-muted", "card-text", "popover-text"],
  },
  {
    title: "Action & focus",
    note: "The one filled call to action, the pointer feedback under it, and the focus ring that is never hidden.",
    names: ["action", "action-text", "hover", "hover-text", "focus"],
  },
  {
    title: "Lines",
    note: "Hairlines at 5–15% opacity. Reach for these before reaching for a border colour of your own.",
    names: ["line", "line-input"],
  },
  {
    title: "Status",
    note: "The only place colour is allowed to mean something. Each fill ships with the ink that reads on it.",
    prefixes: ["danger", "success", "warning", "highlight"],
  },
  {
    title: "Chips",
    note: "The soft fills: a pill around one word of metadata, and the recessed panel below the card tier.",
    prefixes: ["chip"],
  },
  {
    title: "Sidebar",
    note: "The rail melts into the gutter, so its own surface is transparent and only its states paint.",
    prefixes: ["sidebar"],
  },
  {
    title: "Avatars",
    note: "Agent helmets are vivid, teammate faces are deliberately desaturated, so a person never competes with an agent.",
    prefixes: ["agent-", "person-"],
  },
  {
    title: "Everything else",
    note: "Tokens no block above claims yet. A name here means the palette grew and this page has not been told what the new token is for.",
  },
];

function prettify(name: string): string {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeToken(name: string): ColorToken {
  const curated = COLOR_VOCABULARY[name];
  return {
    name,
    variable: `--ht-${name}`,
    label: curated?.label ?? prettify(name),
    role:
      curated?.role ??
      "Not described yet — add a line for it in color-vocabulary.ts.",
  };
}

export const COLOR_TOKEN_GROUPS: readonly ColorTokenGroup[] = (() => {
  const unfiled = new Set(COLOR_TOKEN_NAMES);
  const claims = (block: (typeof BLOCKS)[number], name: string) =>
    (block.names?.includes(name) ?? false) ||
    (block.prefixes?.some((prefix) => name.startsWith(prefix)) ?? false);

  const groups = BLOCKS.map((block, index) => {
    const last = index === BLOCKS.length - 1;
    const tokens = [...unfiled]
      .filter((name) => (last ? true : claims(block, name)))
      .map(describeToken);
    for (const token of tokens) unfiled.delete(token.name);
    return { title: block.title, note: block.note, tokens };
  });

  return groups.filter((group) => group.tokens.length > 0);
})();
