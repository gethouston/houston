"use client";

import { memo } from "react";
import { CodeBlockActions } from "./code-block-actions";
import type { ToolEntry } from "./feed-to-messages";
import { TruncatedCode } from "./tool-code";
import { EditContent } from "./tool-content-edit";
import { CodeResult } from "./tool-content-result";

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
    <div className="rounded-lg border border-line/50 overflow-hidden">
      {command && (
        <div className="flex items-center gap-3 border-b border-line/30 bg-chip-subtle/50 px-3 py-1.5 text-xs font-mono text-ink">
          <div className="min-w-0 flex-1 truncate">
            <span className="text-ink-muted">$ </span>
            {command}
          </div>
          {output && <CodeBlockActions code={output.content} />}
        </div>
      )}
      {output && (
        <TruncatedCode
          content={output.content}
          maxLines={15}
          isError={output.is_error}
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
    return <p className="text-xs text-ink-muted py-1">{label}</p>;
  }
  return (
    <div className="rounded-lg border border-line/50 overflow-hidden">
      <TruncatedCode content={result.content} maxLines={20} />
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
    <div className="rounded-lg border border-line/50 overflow-hidden">
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
