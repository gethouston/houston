// The token NAMES come from the design-system source of truth itself — the
// semantic colour set `@houston/design-tokens` compiles into the `--ht-*` CSS
// custom properties. Reading the JSON rather than restating it means a token
// added to the palette shows up on this page the moment it is added, and a
// token deleted from the palette disappears with it. (The committed `tokens/`
// JSON is read, never the generated `dist/`, so the page never depends on the
// token package having been built.)
import semanticColors from "../../../../packages/design-tokens/tokens/semantic/color.light.json";

import { COLOR_VOCABULARY } from "./color-vocabulary";

/** One `--ht-*` token, as this page presents it. */
export interface ColorToken {
  /** The token name without the `--ht-` prefix, e.g. `card-hover`. */
  name: string;
  /** The CSS custom property, e.g. `--ht-card-hover`. */
  variable: string;
  /** The plain-English name a designer says out loud, e.g. `Card hover`. */
  label: string;
  /** One sentence on what the token is for. */
  role: string;
}

/** A titled block of the page, with the tokens filed under it. */
export interface ColorTokenGroup {
  title: string;
  note: string;
  tokens: readonly ColorToken[];
}

/**
 * A design-token JSON node: either a leaf carrying a `$value`, or a group of
 * further nodes (`agent`, `person`). `$type` sits beside them and is not a
 * token.
 */
type TokenNode = { $value?: unknown } & Record<string, unknown>;

/**
 * Every semantic colour token, flattened to the same dash-joined names the
 * generated CSS uses (`ht.agent.forest` → `agent-forest`), in the order the
 * JSON declares them.
 */
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

/** Every `--ht-*` colour token name, palette order. */
export const COLOR_TOKEN_NAMES: readonly string[] = flatten(
  (semanticColors as { ht: TokenNode }).ht,
);

/**
 * The blocks of the page, in reading order: the surfaces a screen is built
 * from, then the ink on them, then the interactive and structural roles, then
 * the families that only one feature uses.
 *
 * A token is filed under the FIRST block that claims it — by exact name where
 * a family shares a prefix with another block (`card-text` is ink, not a
 * surface), by prefix where the family is the block. The trailing block claims
 * whatever is left, so a token added to the palette can never fall off the
 * page just because nobody filed it.
 */
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

/** `card-hover` → `Card hover`, the last-resort label for an unnamed token. */
function prettify(name: string): string {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One token, with its curated name and role — or an honest stand-in. */
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

/** The page, assembled: every token filed under exactly one block. */
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

  // A block with nothing in it is noise, not information — the catch-all is
  // empty on a healthy palette, and every other block is empty only if the
  // token family it documents was deleted.
  return groups.filter((group) => group.tokens.length > 0);
})();
