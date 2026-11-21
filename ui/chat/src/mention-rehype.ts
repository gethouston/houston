import type { MentionTarget } from "./mention-spans.ts";
import { findMentionSpans } from "./mention-spans.ts";
import { normalizeMentionText } from "./mention-text.ts";

export const MENTION_NAME_ATTR = "data-mention-name";
export const MENTION_SELF_ATTR = "data-mention-self";

const SKIP_TAGS = new Set(["code", "pre", "a"]);

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
