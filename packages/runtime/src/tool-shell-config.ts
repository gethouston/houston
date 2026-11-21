import { isAbsolute } from "node:path";

export function parseToolShell(raw: string | undefined): string | null {
  const path = raw?.trim() ?? "";
  if (path === "") return null;
  if (!isAbsolute(path))
    throw new Error(
      `HOUSTON_TOOL_SHELL must be an absolute path, got "${path}"`,
    );
  return path;
}
