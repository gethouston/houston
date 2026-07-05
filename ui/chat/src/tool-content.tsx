"use client";

import { memo } from "react";
import { CodeBlockActions } from "./code-block-actions";
import type { ToolEntry } from "./feed-to-messages";
import { TruncatedCode, truncateStr } from "./tool-code";

export const ToolContent = memo(({ tool }: { tool: ToolEntry }) => {
  const short = tool.name.includes("__")
    ? (tool.name.split("__").at(-1) ?? tool.name)
    : tool.name;
  const inp = tool.input as Record<string, unknown> | null | undefined;
  const result = tool.result;

  switch (short) {
    case "Bash":
      return <BashContent command={inp?.command as string} result={result} />;
    case "Read":
      return <FileContent result={result} />;
    case "Edit":
      return <EditContent input={inp} result={result} />;
    case "Write":
      return <FileContent result={result} label="Written" />;
    case "Grep":
    case "Glob":
      return <SearchContent result={result} />;
    default:
      return <GenericContent result={result} />;
  }
});
ToolContent.displayName = "ToolContent";

function BashContent({
  command,
  result,
}: {
  command?: string;
  result?: ToolEntry["result"];
}) {
  return (
    <div className="rounded-lg bg-zinc-900 text-zinc-100 overflow-hidden">
      {command && (
        <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-1.5 text-xs font-mono">
          <div className="min-w-0 flex-1 truncate">
            <span className="text-zinc-500">$ </span>
            {command}
          </div>
          {result && <CodeBlockActions code={result.content} dark />}
        </div>
      )}
      {result && (
        <TruncatedCode
          content={result.content}
          maxLines={15}
          isError={result.is_error}
          dark
          showActions={!command}
        />
      )}
    </div>
  );
}

function FileContent({
  result,
  label,
}: {
  result?: ToolEntry["result"];
  label?: string;
}) {
  if (!result) return null;
  if (label && result.content === "ok") {
    return <p className="text-xs text-muted-foreground py-1">{label}</p>;
  }
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <TruncatedCode content={result.content} maxLines={20} />
    </div>
  );
}

function EditContent({
  input,
  result,
}: {
  input?: Record<string, unknown> | null;
  result?: ToolEntry["result"];
}) {
  if (result?.is_error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
        {result.content}
      </div>
    );
  }
  const oldStr = input?.old_string as string | undefined;
  const newStr = input?.new_string as string | undefined;
  if (!oldStr && !newStr) return <GenericContent result={result} />;
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden text-xs font-mono">
      {oldStr && <DiffLine sign="-" text={oldStr} tone="red" />}
      {newStr && <DiffLine sign="+" text={newStr} tone="green" />}
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
  return (
    <div
      className={`${tone === "red" ? "bg-red-50 dark:bg-red-950/40 border-b" : "bg-green-50 dark:bg-green-950/40"} px-3 py-1.5 border-border/30`}
    >
      <span
        className={`${tone === "red" ? "text-red-400" : "text-green-400"} select-none`}
      >
        {sign}{" "}
      </span>
      <span
        className={
          tone === "red"
            ? "text-red-700 dark:text-red-300"
            : "text-green-700 dark:text-green-300"
        }
      >
        {truncateStr(text, 200)}
      </span>
    </div>
  );
}

function SearchContent({ result }: { result?: ToolEntry["result"] }) {
  if (!result) return null;
  return <CodeResult result={result} maxLines={12} />;
}

function GenericContent({ result }: { result?: ToolEntry["result"] }) {
  if (!result) return null;
  return <CodeResult result={result} maxLines={10} />;
}

function CodeResult({
  result,
  maxLines,
}: {
  result: NonNullable<ToolEntry["result"]>;
  maxLines: number;
}) {
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <TruncatedCode content={result.content} maxLines={maxLines} />
    </div>
  );
}
