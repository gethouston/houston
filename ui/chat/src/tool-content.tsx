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

  // Two dialects: Claude tool names (PascalCase) and pi coding-agent names
  // (lowercase). Same renderers for both (HOU-717).
  switch (short) {
    case "Bash":
    case "bash":
      return <BashContent command={inp?.command as string} result={result} />;
    case "Read":
    case "read":
      return <FileContent result={result} />;
    case "Edit":
    case "edit":
      return <EditContent input={inp} result={result} />;
    case "Write":
    case "write":
      return <FileContent result={result} label="Written" />;
    case "Grep":
    case "Glob":
    case "grep":
    case "find":
    case "ls":
      return <SearchContent result={result} />;
    default:
      return <GenericContent tool={tool} />;
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
  // A result with no text (a command with no stdout, or history from before
  // outputs were persisted) renders the command line alone — never an empty
  // output box (HOU-717).
  const output = result?.content ? result : undefined;
  if (!command && !output) return null;
  return (
    <div className="rounded-lg bg-zinc-900 text-zinc-100 overflow-hidden">
      {command && (
        <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-1.5 text-xs font-mono">
          <div className="min-w-0 flex-1 truncate">
            <span className="text-zinc-500">$ </span>
            {command}
          </div>
          {output && <CodeBlockActions code={output.content} dark />}
        </div>
      )}
      {output && (
        <TruncatedCode
          content={output.content}
          maxLines={15}
          isError={output.is_error}
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
  if (!result?.content) return null;
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
  // Claude's Edit carries old_string/new_string; pi's edit carries
  // edits: [{ oldText, newText }] — normalize both to diff pairs.
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
    <div className="rounded-lg border border-border/50 overflow-hidden text-xs font-mono">
      {pairs.map((p, i) => (
        // Order is the render identity here: pairs are derived per render.
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
  return <CodeResult result={result} maxLines={12} />;
}

/**
 * Unknown tools: show the result text when there is one, else fall back to
 * the call's arguments — an opened row must show SOMETHING about the call,
 * never an empty box (HOU-717).
 */
function GenericContent({ tool }: { tool: ToolEntry }) {
  if (tool.result?.content)
    return <CodeResult result={tool.result} maxLines={10} />;
  const args = formatArgs(tool.input);
  if (!args) return null;
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <TruncatedCode content={args} maxLines={10} />
    </div>
  );
}

/** Pretty-print tool arguments; empty/absent args read as "nothing to show". */
function formatArgs(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === "string") return input || null;
  try {
    const json = JSON.stringify(input, null, 2);
    return json === "{}" || json === "[]" ? null : json;
  } catch {
    return null;
  }
}

function CodeResult({
  result,
  maxLines,
}: {
  result?: ToolEntry["result"];
  maxLines: number;
}) {
  if (!result?.content) return null;
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <TruncatedCode content={result.content} maxLines={maxLines} />
    </div>
  );
}
