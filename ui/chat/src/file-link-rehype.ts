/**
 * Rescue links to workspace FILES from the markdown pipeline (PRODUCT-1231).
 *
 * Agents end a turn by linking the file they just wrote — `[Perfil](perfil.md)`,
 * `[Plan](<Tropical Food - Plan.md>)`. Two passes in Streamdown's own chain
 * conspire to destroy exactly those links:
 *
 * 1. **micromark** normalizes every link destination through `normalizeUri`, so
 *    a name with a space or an accent arrives percent-encoded
 *    (`Tropical%20Food%20-%20Plan.md`). Handed to a file API verbatim, that
 *    names a file which does not exist.
 * 2. **rehype-harden** treats a destination as relative ONLY when it starts
 *    with `/`, `./` or `../`. A BARE `perfil.md` parses as neither absolute
 *    nor relative, so it is blocked outright: the `<a>` is replaced by an inert
 *    grey `<span>` with " [blocked]" appended. The user saw their own file
 *    named in chat as dead text.
 *
 * This pass runs AFTER `sanitize` (so the attribute it mints survives the
 * whitelist, which does not include it) and BEFORE `harden` (so it can hand
 * harden a shape harden accepts). For every file-ish destination it:
 *
 *   - records the decoded, pristine path on `data-file-path`, which harden
 *     preserves and the `a` override in `ai-elements/message.tsx` opens; and
 *   - rewrites a bare destination to `./`-prefixed form so harden lets it live.
 *
 * Harden still owns the `href` and still rewrites it (`./a.md` → `/a.md`,
 * re-encoded); nothing here weakens it. The renderer simply stops using that
 * mangled href as a file path and reads `data-file-path` instead.
 */

import { splitFileLinks } from "./file-link-text.ts";

/** Attribute the `a` override reads the true workspace path from. */
export const FILE_PATH_ATTR = "data-file-path";

/** The slice of hast this transform needs. Declared structurally so `ui/chat`
 *  takes no `@types/hast` dependency. */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** `https:`, `mailto:`, `houston:` — anything with a scheme is not a file. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** A percent-escape micromark could have minted (`%20`, `%C3%A9`, …). */
const PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/;

/**
 * The workspace path a markdown destination refers to, or null when the
 * destination is not a file reference at all (an absolute URL, a
 * protocol-relative `//host`, an in-page `#anchor`, a bare query).
 *
 * The returned path keeps whatever prefix the agent wrote (`./`, `/`, bare) —
 * consumers normalize that themselves, and an engine-absolute path like
 * `/Users/jo/.houston/workspaces/W/A/perfil.md` must survive intact.
 */
export function markdownFilePath(href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (HAS_SCHEME.test(raw)) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("#") || raw.startsWith("?")) return null;
  return decodePath(raw);
}

/**
 * Undo micromark's percent-encoding. Returns the input unchanged when there is
 * nothing to decode or when the escapes are malformed (`decodeURIComponent`
 * throws on a lone `%`), which is also the right answer for a file genuinely
 * named `100%.md`.
 */
function decodePath(path: string): string {
  if (!PERCENT_ESCAPE.test(path)) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * The `<a>` properties a workspace-file destination should carry, or null when
 * it does not name one. Shared by the two ways a file link reaches this pass:
 * an anchor markdown already parsed, and one {@link splitFileLinks} recovers
 * from text that CommonMark refused to parse.
 */
export function fileLinkProperties(
  destination: string,
): Record<string, unknown> | null {
  const path = markdownFilePath(destination);
  if (path === null) return null;
  // Harden only recognizes `/`, `./` and `../` as relative; a bare `perfil.md`
  // would be blocked outright. `./` is semantically identical and makes the
  // destination legible to harden.
  const href =
    destination.startsWith("/") || destination.startsWith(".")
      ? destination
      : `./${destination}`;
  return { href, [FILE_PATH_ATTR]: path };
}

/** Tags whose subtree is verbatim content, never prose. A `[x](y z.md)` typed
 *  inside a code span or already inside a link must stay untouched. */
const SKIP_TAGS = new Set(["code", "pre", "a"]);

/**
 * The rehype plugin. Takes no options, so Streamdown's processor cache (keyed
 * on plugin name + `JSON.stringify(options)`) stays a single stable entry.
 */
export function fileLinkRehypePlugin() {
  return (tree: unknown) => {
    walk(tree as HastNode, false);
  };
}

function walk(node: HastNode, skip: boolean): void {
  if (node.tagName === "a" && node.properties) {
    const href = node.properties.href;
    if (typeof href === "string") {
      const properties = fileLinkProperties(href);
      if (properties) Object.assign(node.properties, properties);
    }
  }

  const children = node.children;
  if (!children || children.length === 0) return;

  const next: HastNode[] = [];
  let changed = false;
  for (const child of children) {
    if (child.type === "element") {
      walk(child, skip || SKIP_TAGS.has(child.tagName ?? ""));
      next.push(child);
      continue;
    }
    if (skip || child.type !== "text" || typeof child.value !== "string") {
      next.push(child);
      continue;
    }
    const split = splitFileLinks(child.value, fileLinkProperties);
    if (!split) {
      next.push(child);
      continue;
    }
    changed = true;
    next.push(...split);
  }
  if (changed) node.children = next;
}
