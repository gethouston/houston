import { isAbsolute, join, resolve } from "node:path";

export type DeferredNeed =
  | { kind: "none" }
  | { kind: "paths"; paths: string[]; folder?: true }
  | { kind: "all" };

const HOUSTON_MCP_PREFIX = "mcp__houston__";

const WHOLE_TREE: ReadonlySet<string> = new Set(["Bash", "bash", "run_code"]);

const FILE_PARAM: ReadonlyMap<string, string> = new Map([
  ["Read", "file_path"],
  ["Write", "file_path"],
  ["Edit", "file_path"],
  ["MultiEdit", "file_path"],
  ["NotebookEdit", "notebook_path"],
  ["NotebookRead", "notebook_path"],
  ["read", "path"],
  ["edit", "path"],
  ["write", "path"],
]);

const SEARCH_TOOLS: ReadonlyMap<string, { glob: boolean }> = new Map([
  ["Glob", { glob: true }],
  ["Grep", { glob: false }],
  ["LS", { glob: false }],
  ["ls", { glob: false }],
  ["find", { glob: true }],
  ["grep", { glob: false }],
]);

function staticPrefix(pattern: string): string {
  const fixed: string[] = [];
  for (const segment of pattern.split("/")) {
    if (/[*?[\]{}!]/.test(segment)) break;
    fixed.push(segment);
  }
  return fixed.join("/");
}

function param(input: unknown, name: string): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function searchRoot(
  input: unknown,
  workspaceDir: string,
  glob: boolean,
): string {
  const base = resolve(workspaceDir, param(input, "path") ?? ".");
  const pattern = glob ? param(input, "pattern") : undefined;
  if (!pattern) return base;
  const fixed = staticPrefix(pattern);
  return isAbsolute(fixed) ? fixed : join(base, fixed);
}

export function deferredNeed(
  toolName: string,
  input: unknown,
  workspaceDir: string,
): DeferredNeed {
  const name = toolName.startsWith(HOUSTON_MCP_PREFIX)
    ? toolName.slice(HOUSTON_MCP_PREFIX.length)
    : toolName;
  if (WHOLE_TREE.has(name)) return { kind: "all" };
  const fileParam = FILE_PARAM.get(name);
  if (fileParam) {
    const path = param(input, fileParam);
    return path
      ? { kind: "paths", paths: [resolve(workspaceDir, path)] }
      : { kind: "none" };
  }
  const search = SEARCH_TOOLS.get(name);
  if (search)
    return {
      kind: "paths",
      paths: [searchRoot(input, workspaceDir, search.glob)],
      folder: true,
    };
  return { kind: "none" };
}
