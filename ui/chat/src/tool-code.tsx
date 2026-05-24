"use client";

import { memo, useState } from "react";
import { CodeBlockActions } from "./code-block-actions";
import type { ToolEntry } from "./feed-to-messages";

export const TruncatedCode = memo(
  ({
    content,
    maxLines,
    isError,
    dark,
    showActions = true,
  }: {
    content: string;
    maxLines: number;
    isError?: boolean;
    dark?: boolean;
    showActions?: boolean;
  }) => {
    const [expanded, setExpanded] = useState(false);
    const lines = content.split("\n");
    const needsTruncation = lines.length > maxLines;
    const display = expanded ? content : lines.slice(0, maxLines).join("\n");
    const remaining = lines.length - maxLines;
    const toolbarClass = dark
      ? "flex justify-end border-b border-zinc-800 px-2 py-1"
      : "flex justify-end border-b border-border/30 bg-muted/50 px-2 py-1";

    return (
      <div>
        {showActions && (
          <div className={toolbarClass}>
            <CodeBlockActions code={content} dark={dark} />
          </div>
        )}
        <pre
          className={`select-text px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words overflow-x-auto ${
            dark
              ? isError
                ? "text-red-400"
                : "text-zinc-300"
              : isError
                ? "text-red-600 bg-red-50"
                : "text-foreground bg-muted/50"
          }`}
        >
          {display}
        </pre>
        {needsTruncation && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`w-full px-3 py-1 text-[10px] text-center transition-colors ${
              dark
                ? "text-zinc-500 hover:text-zinc-300 border-t border-zinc-800"
                : "text-muted-foreground hover:text-foreground border-t border-border/30"
            }`}
          >
            {remaining} more lines
          </button>
        )}
      </div>
    );
  },
);
TruncatedCode.displayName = "TruncatedCode";

export function truncateStr(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

export type ToolResult = ToolEntry["result"];
