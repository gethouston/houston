"use client";

import type { ComponentProps, ReactNode } from "react";
import { CodeBlockActions } from "./code-block-actions";

type MarkdownCodeBlockProps = ComponentProps<"code"> & {
  node?: unknown;
  "data-block"?: string;
};

export function MarkdownCodeBlock({
  children,
  className,
  node: _node,
  ...props
}: MarkdownCodeBlockProps) {
  const isBlock = "data-block" in props;
  if (!isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const code = childrenToText(children);
  const language = parseLanguage(className);
  return (
    <div className="my-4 flex w-full flex-col overflow-hidden rounded-xl border border-line bg-sidebar p-2">
      <div className="flex h-8 items-center gap-1.5 text-ink-muted text-xs">
        <span className="ml-1 font-mono lowercase">{language}</span>
        <CodeBlockActions code={code} />
      </div>
      <pre className="select-text overflow-x-auto rounded-md border border-line bg-input p-4 text-sm">
        <code className={className}>{code.trimEnd()}</code>
      </pre>
    </div>
  );
}

function childrenToText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  return "";
}

function parseLanguage(className: string | undefined): string {
  const match = className?.match(/language-([^\s]+)/);
  return match?.[1] ?? "text";
}
