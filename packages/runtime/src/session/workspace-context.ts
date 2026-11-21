import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const WORKSPACE_MD = "WORKSPACE.md";
export const USER_MD = "USER.md";

export interface ProvidedContext {
  workspace: string;
  user: string;
}

const WORKSPACE_HEADING = "# Workspace Context";
const USER_HEADING = "# User Context";

const FILE_WORKSPACE_EMPTY =
  "(empty so far. When the user shares anything about the company, product, " +
  "customers, or workspace conventions, write it to the file path below.)";
const FILE_USER_EMPTY =
  "(empty so far. When the user tells you about their role, goals, or how they " +
  "like to work, write it to the file path below.)";

const MANAGED_EMPTY = "(none provided.)";

function readOrEmpty(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

function section(
  workspace: string,
  user: string,
  workspaceEmpty: string,
  userEmpty: string,
  trailer: string,
): string {
  return [
    WORKSPACE_HEADING,
    "",
    workspace.trim() ? workspace : workspaceEmpty,
    "",
    USER_HEADING,
    "",
    user.trim() ? user : userEmpty,
    "",
    trailer,
  ].join("\n");
}

export function buildWorkspaceContextSection(
  cwd: string,
  provided?: ProvidedContext,
): string | null {
  if (provided) {
    const workspace = provided.workspace.trimEnd();
    const user = provided.user.trimEnd();
    if (!workspace.trim() && !user.trim()) return null;
    return section(
      workspace,
      user,
      MANAGED_EMPTY,
      MANAGED_EMPTY,
      "The two sections above describe the user and their workspace. They are " +
        "maintained by the user and refresh at the start of each chat; you do " +
        "not edit them yourself.",
    );
  }

  if (!existsSync(join(cwd, ".houston"))) return null;
  const workspacePath = join(cwd, WORKSPACE_MD);
  const userPath = join(cwd, USER_MD);
  return section(
    readOrEmpty(workspacePath).trimEnd(),
    readOrEmpty(userPath).trimEnd(),
    FILE_WORKSPACE_EMPTY,
    FILE_USER_EMPTY,
    "The two sections above are loaded from these files at the root of the " +
      `workspace:\n- \`${workspacePath}\` — facts about the workspace, shared ` +
      `by every agent here.\n- \`${userPath}\` — facts about the user running ` +
      "this workspace.\n\nWhen the user tells you something new about " +
      "themselves or about the workspace, update the matching file using its " +
      "path above so future chats remember it. These two files are an explicit " +
      "exception to your working-directory rule: you are allowed to read and " +
      "write them. Edits take effect on the next chat.",
  );
}
