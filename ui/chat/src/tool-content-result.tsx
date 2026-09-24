"use client";

/**
 * The bordered code block that renders a tool result's text, shared by the
 * search, generic and edit renderers. A result with no text renders nothing at
 * all: an opened tool row must never show an empty box (HOU-717). `maxLines`
 * belongs to the caller because how much output is worth showing is a property
 * of the tool, not of this block.
 */

import type { ToolEntry } from "./feed-to-messages";
import { TruncatedCode } from "./tool-code";

export function CodeResult({
  result,
  maxLines,
}: {
  result?: ToolEntry["result"];
  maxLines: number;
}) {
  if (!result?.content) return null;
  return (
    <div className="rounded-lg border border-line/50 overflow-hidden">
      <TruncatedCode content={result.content} maxLines={maxLines} />
    </div>
  );
}
