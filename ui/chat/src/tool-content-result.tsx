"use client";

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
