import type { WorkspaceGuard } from "../../session/tools/fs-guard";
import { isEscapeToken } from "./tool-target-paths";

const PATH_FIELDS = ["file_path", "path", "notebook_path"] as const;

const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "LS"]);

const SEARCH_TOOLS = new Set(["Glob", "Grep", "LS"]);

export type FileCallVerdict =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}

export function isFileCall(toolName: string): boolean {
  return toolName !== "Bash" && !toolName.startsWith("mcp__");
}

export function judgeFileCall(
  guard: WorkspaceGuard,
  toolName: string,
  input: Record<string, unknown>,
): FileCallVerdict {
  if (!isFileCall(toolName)) return { behavior: "allow" };
  const judge = isReadOnlyTool(toolName)
    ? (raw: string | undefined) => guard.clamp(raw)
    : (raw: string | undefined) => guard.clampWrite(raw);
  try {
    const updatedInput: Record<string, unknown> = { ...input };
    let rewritten = false;
    for (const field of PATH_FIELDS) {
      const raw = input[field];
      if (raw === undefined) continue;
      if (typeof raw !== "string")
        throw new Error(`The ${field} of a ${toolName} call must be a path.`);
      updatedInput[field] = judge(raw);
      rewritten = true;
    }
    if (SEARCH_TOOLS.has(toolName) && input.path === undefined)
      judge(undefined);
    if (
      toolName === "Glob" &&
      typeof input.pattern === "string" &&
      isEscapeToken(input.pattern)
    )
      judge(input.pattern);
    return rewritten
      ? { behavior: "allow", updatedInput }
      : { behavior: "allow" };
  } catch (err) {
    return {
      behavior: "deny",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
