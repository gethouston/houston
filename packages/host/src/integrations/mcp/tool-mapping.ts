import type { ActionResult, ToolMatch } from "../types";
import type { McpCallResult } from "./client";

type Tools = Awaited<
  ReturnType<
    import("@modelcontextprotocol/sdk/client/index.js").Client["listTools"]
  >
>["tools"];

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function overlap(left: Set<string>, right: Set<string>): number {
  return [...left].filter((token) => right.has(token)).length;
}

export function rankTools(tools: Tools, query: string) {
  const queryTokens = tokenize(query);
  return tools
    .map((tool, index) => ({
      tool,
      index,
      score: overlap(
        queryTokens,
        tokenize(`${tool.name} ${tool.description ?? ""}`),
      ),
    }))
    .filter(({ score }) => queryTokens.size === 0 || score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 10);
}

export function mapMcpResult(result: McpCallResult): ActionResult {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .flatMap((part) =>
      part &&
      typeof part === "object" &&
      part.type === "text" &&
      typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n");
  const data = result.structuredContent ?? text;
  return {
    successful: result.isError !== true,
    ...(data !== "" ? { data } : {}),
    ...(result.isError ? { error: text } : {}),
  };
}

/** A plain (non-hub) server's search results: its tools, ranked, one toolkit. */
export function plainSearchMatches(
  tools: Tools,
  query: string,
  toolkit: string,
): ToolMatch[] {
  return rankTools(tools, query).map(({ tool }) => ({
    action: tool.name,
    toolkit,
    description: tool.description ?? "",
    inputParams: tool.inputSchema,
    connected: true,
    status: "connected" as const,
  }));
}
