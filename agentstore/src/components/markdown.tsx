import type * as React from "react";
import { type MarkdownBlock, parseMarkdownBlocks } from "./markdown-blocks";

/**
 * A small, dependency-free Markdown renderer for agent-authored descriptions.
 *
 * It emits React elements only — never `dangerouslySetInnerHTML` — so all text
 * is escaped by React and no author-supplied HTML can execute. It covers the
 * subset that shows up in agent descriptions: headings, paragraphs, ordered and
 * unordered lists, fenced code, blockquotes, thematic breaks, and inline
 * emphasis / code / links. Links are limited to http(s) and open in a new tab
 * with `rel="noopener noreferrer"`; anything else renders as plain text.
 */
export function Markdown({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content.replace(/\r\n/g, "\n"));
  return (
    <div className="flex flex-col gap-4 leading-relaxed break-words">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-2xl font-semibold tracking-tight",
  2: "text-xl font-semibold tracking-tight",
  3: "text-lg font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold text-ink-muted",
};

function renderBlock(block: MarkdownBlock, key: number): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag key={key} className={HEADING_CLASS[block.level]}>
          {renderInline(block.text)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="text-ink/90">
          {renderInline(block.text)}
        </p>
      );
    case "code":
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-lg border bg-chip-subtle/60 p-4 text-sm"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-line pl-4 text-ink-muted italic"
        >
          {renderInline(block.text)}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="border-line" />;
    case "list": {
      const cls = "flex flex-col gap-1 pl-5 text-ink/90";
      const items = block.items.map((item, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static, non-reordering list
        <li key={idx} className="list-item">
          {renderInline(item)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} className={`${cls} list-decimal`}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={`${cls} list-disc`}>
          {items}
        </ul>
      );
    }
  }
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  // biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [token] = match;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-chip-subtle px-1.5 py-0.5 text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = link?.[1] ?? token;
      const href = link?.[2] ?? "";
      nodes.push(
        isSafeHref(href) ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-action underline underline-offset-4"
          >
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }

    last = match.index + token.length;
    key += 1;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
