import type * as React from "react";

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
  const blocks = parseBlocks(content.replace(/\r\n/g, "\n"));
  return (
    <div className="flex flex-col gap-4 leading-relaxed break-words">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "list"; ordered: boolean; items: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(?:---|\*\*\*|___)\s*$/;
const UL = /^[-*+]\s+(.*)$/;
const OL = /^\d+[.)]\s+(.*)$/;

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // consume the closing fence (if present)
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]?.length ?? 1,
        text: (heading[2] ?? "").trim(),
      });
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: body.join("\n").trim() });
      continue;
    }

    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const pattern = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").match(pattern)?.[1]?.trim() ?? "");
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !(lines[i] ?? "").startsWith("```") &&
      !(lines[i] ?? "").startsWith(">") &&
      !HEADING.test(lines[i] ?? "") &&
      !HR.test(lines[i] ?? "") &&
      !UL.test(lines[i] ?? "") &&
      !OL.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "paragraph", text: para.join("\n").trim() });
  }

  return blocks;
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-2xl font-semibold tracking-tight",
  2: "text-xl font-semibold tracking-tight",
  3: "text-lg font-semibold",
  4: "text-base font-semibold",
  5: "text-sm font-semibold",
  6: "text-sm font-semibold text-muted-foreground",
};

function renderBlock(block: Block, key: number): React.ReactNode {
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
        <p key={key} className="text-foreground/90">
          {renderInline(block.text)}
        </p>
      );
    case "code":
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-lg border bg-muted/60 p-4 text-sm"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-border pl-4 text-muted-foreground italic"
        >
          {renderInline(block.text)}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="border-border" />;
    case "list": {
      const cls = "flex flex-col gap-1 pl-5 text-foreground/90";
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
        <code key={key} className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">
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
            className="font-medium text-primary underline underline-offset-4"
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
