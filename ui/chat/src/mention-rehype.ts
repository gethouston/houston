/**
 * Markdown-safe @mention injection (HOU-944).
 *
 * A hand-rolled rehype transform (no new dependency) that runs AFTER
 * Streamdown's own `raw` → `sanitize` → `harden` chain, so the spans it mints
 * are never stripped and the sanitizer stays fully in force. It splits text
 * nodes on their "@Name" runs and marks each with `data-mention-name`, which
 * the `span` component override in `ai-elements/message.tsx` turns into a
 * `MentionChip`.
 *
 * Nodes under `code`, `pre` or `a` are skipped: a mention must never appear
 * inside a code span, a code block, or a link's text.
 */

import type { MentionTarget } from "./mention-spans.ts";
import { findMentionSpans } from "./mention-spans.ts";
import { normalizeMentionText } from "./mention-text.ts";

/** Attribute the chip renderer keys off. */
export const MENTION_NAME_ATTR = "data-mention-name";
/** Present (empty string) when the mention points at the signed-in viewer. */
export const MENTION_SELF_ATTR = "data-mention-self";

/** Tags whose subtree is verbatim content, never prose. */
const SKIP_TAGS = new Set(["code", "pre", "a"]);

/** The slice of hast this transform needs. Declared structurally so `ui/chat`
 *  takes no `@types/hast` dependency. */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

export interface MentionRehypeOptions {
  targets: readonly MentionTarget[];
}

/**
 * The rehype plugin. Always pass it in TUPLE form —
 * `[mentionRehypePlugin, { targets }]` — because Streamdown keys its compiled
 * processor cache on the plugin's name plus `JSON.stringify(options)`; a bare
 * closure would make two messages with different rosters share one processor.
 */
export function mentionRehypePlugin(options: MentionRehypeOptions) {
  const targets = options.targets;
  return (tree: unknown) => {
    if (targets.length === 0) return;
    walk(tree as HastNode, targets, false);
  };
}

function walk(
  node: HastNode,
  targets: readonly MentionTarget[],
  skip: boolean,
): void {
  const children = node.children;
  if (!children || children.length === 0) return;

  const next: HastNode[] = [];
  let changed = false;
  for (const child of children) {
    if (child.type === "element") {
      walk(child, targets, skip || SKIP_TAGS.has(child.tagName ?? ""));
      next.push(child);
      continue;
    }
    if (skip || child.type !== "text" || typeof child.value !== "string") {
      next.push(child);
      continue;
    }
    const split = splitText(child.value, targets);
    if (!split) {
      next.push(child);
      continue;
    }
    changed = true;
    next.push(...split);
  }
  if (changed) node.children = next;
}

/**
 * The text node's replacement nodes, or null when it holds no mention.
 *
 * Slices the NFC form, because that is what `findMentionSpans` returns offsets
 * into. The two forms render identically, so re-emitting the normalized text is
 * invisible to the reader and keeps every offset honest.
 */
function splitText(
  raw: string,
  targets: readonly MentionTarget[],
): HastNode[] | null {
  const spans = findMentionSpans(raw, targets);
  if (spans.length === 0) return null;
  const value = normalizeMentionText(raw);

  const out: HastNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      out.push({ type: "text", value: value.slice(cursor, span.start) });
    }
    out.push(mentionElement(value.slice(span.start, span.end), span.target));
    cursor = span.end;
  }
  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }
  return out;
}

function mentionElement(text: string, target: MentionTarget): HastNode {
  const properties: Record<string, unknown> = {
    [MENTION_NAME_ATTR]: target.name,
  };
  if (target.isSelf) properties[MENTION_SELF_ATTR] = "";
  return {
    type: "element",
    tagName: "span",
    properties,
    children: [{ type: "text", value: text }],
  };
}
