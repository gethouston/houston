"use client";

import type { ToolEntry } from "./feed-to-messages";
import { truncateStr } from "./tool-code";
import { CodeResult } from "./tool-content-result";

export function EditContent({
  input,
  result,
}: {
  input?: Record<string, unknown> | null;
  result?: ToolEntry["result"];
}) {
  if (result?.is_error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-ink">
        {result.content}
      </div>
    );
  }
  const pairs: { old?: string; new?: string }[] = [];
  const oldStr = input?.old_string as string | undefined;
  const newStr = input?.new_string as string | undefined;
  if (oldStr || newStr) pairs.push({ old: oldStr, new: newStr });
  const piEdits = input?.edits;
  if (Array.isArray(piEdits)) {
    for (const e of piEdits as { oldText?: string; newText?: string }[]) {
      if (e?.oldText || e?.newText)
        pairs.push({ old: e.oldText, new: e.newText });
    }
  }
  if (pairs.length === 0) return <CodeResult result={result} maxLines={10} />;
  return (
    <div className="rounded-lg border border-line/50 overflow-hidden text-xs font-mono">
      {pairs.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static derived list
        <div key={i}>
          {p.old && <DiffLine sign="-" text={p.old} tone="red" />}
          {p.new && <DiffLine sign="+" text={p.new} tone="green" />}
        </div>
      ))}
    </div>
  );
}

function DiffLine({
  sign,
  text,
  tone,
}: {
  sign: string;
  text: string;
  tone: "red" | "green";
}) {
  const ink = tone === "red" ? "text-danger-ink" : "text-success-ink";
  return (
    <div
      className={`${tone === "red" ? "bg-danger/10 border-b" : "bg-success/10"} px-3 py-1.5 border-line/30 ${ink}`}
    >
      <span className="select-none">{sign} </span>
      {truncateStr(text, 200)}
    </div>
  );
}
