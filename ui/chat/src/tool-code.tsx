"use client";

import { memo, useState } from "react";
import { CodeBlockActions } from "./code-block-actions";
import type { ToolEntry } from "./feed-to-messages";

export const TruncatedCode = memo(
  ({
    content,
    maxLines,
    isError,
    showActions = true,
  }: {
    content: string;
    maxLines: number;
    isError?: boolean;
    showActions?: boolean;
  }) => {
    const [expanded, setExpanded] = useState(false);
    const lines = content.split("\n");
    const needsTruncation = lines.length > maxLines;
    const display = expanded ? content : lines.slice(0, maxLines).join("\n");
    const remaining = lines.length - maxLines;

    return (
      <div>
        {showActions && (
          <div className="flex justify-end border-b border-line/30 bg-chip-subtle/50 px-2 py-1">
            <CodeBlockActions code={content} />
          </div>
        )}
        <pre
          className={`select-text px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words overflow-x-auto ${
            isError
              ? "text-danger-ink bg-danger/10"
              : "text-ink bg-chip-subtle/50"
          }`}
        >
          {display}
        </pre>
        {needsTruncation && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full px-3 py-1 text-[10px] text-center transition-colors text-ink-muted hover:text-ink border-t border-line/30"
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
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

export type ToolResult = ToolEntry["result"];
