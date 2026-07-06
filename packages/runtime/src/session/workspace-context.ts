import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Workspace-level context files at the agent's workspace root:
 *
 * - `WORKSPACE.md` — facts about the company / product / shared environment.
 * - `USER.md` — facts about the human running this workspace.
 *
 * Both are user-editable (the Settings "Workspace context" / "Your context"
 * screens) and agent-editable (the agent can update them with its file-write
 * tool when the user shares something new). They are appended to every chat's
 * system prompt at session start, so edits take effect on the NEXT chat.
 *
 * Ported from the removed Rust engine's `workspace_context::build_prompt_section`
 * (feature #153) after the TS-engine cutover dropped it (HOU-711).
 */
export const WORKSPACE_MD = "WORKSPACE.md";
export const USER_MD = "USER.md";

const WORKSPACE_EMPTY =
  "(empty so far. When the user shares anything about the company, product, " +
  "customers, or workspace conventions, write it to the file path below.)";
const USER_EMPTY =
  "(empty so far. When the user tells you about their role, goals, or how they " +
  "like to work, write it to the file path below.)";

function readOrEmpty(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    // A context file we cannot read is treated as empty rather than failing the
    // whole session start — the agent still gets its instructions + the slot
    // markers, and the read is retried on the next chat.
    return "";
  }
}

/**
 * Build the "# Workspace Context" / "# User Context" section appended to an
 * agent's system prompt, loaded from `WORKSPACE.md` + `USER.md` at `cwd` (the
 * agent's workspace root).
 *
 * Always present for a real agent workspace (one with a `.houston/` dir), even
 * when both files are empty or missing: the section tells the agent the slots
 * exist, what they hold, and that it is authorized to write them. Returns null
 * for a dir that is NOT a real workspace (no `.houston/`), so ad-hoc/test
 * working dirs are not polluted with stub paths.
 */
export function buildWorkspaceContextSection(cwd: string): string | null {
  if (!existsSync(join(cwd, ".houston"))) return null;

  const workspacePath = join(cwd, WORKSPACE_MD);
  const userPath = join(cwd, USER_MD);
  const workspace = readOrEmpty(workspacePath).trimEnd();
  const user = readOrEmpty(userPath).trimEnd();

  return [
    "# Workspace Context",
    "",
    workspace.trim() ? workspace : WORKSPACE_EMPTY,
    "",
    "# User Context",
    "",
    user.trim() ? user : USER_EMPTY,
    "",
    "The two sections above are loaded from these files at the root of the workspace:",
    `- \`${workspacePath}\` — facts about the workspace, shared by every agent here.`,
    `- \`${userPath}\` — facts about the user running this workspace.`,
    "",
    "When the user tells you something new about themselves or about the " +
      "workspace, update the matching file using its path above so future chats " +
      "remember it. These two files are an explicit exception to your " +
      "working-directory rule: you are allowed to read and write them. Edits " +
      "take effect on the next chat; the current chat keeps the copy loaded at " +
      "startup.",
  ].join("\n");
}
