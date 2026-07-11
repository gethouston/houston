import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Workspace + user context folded into an agent's system prompt (HOU-711),
 * from ONE of two sources:
 *
 *  - LOCAL / self-host — two files at the agent's workspace root, `WORKSPACE.md`
 *    and `USER.md`, editable by the user (Settings) AND the agent (its file
 *    tool). Read here from `cwd`.
 *  - CLOUD — the gateway supplies both blobs on the turn body from Supabase (the
 *    single source of truth); nothing is on the volume and the agent can't
 *    self-edit them (the user maintains them in the app).
 */
export const WORKSPACE_MD = "WORKSPACE.md";
export const USER_MD = "USER.md";
export const GROUP_MD = "GROUP.md";

/** Gateway-provided context (cloud): the two blobs read from Supabase. */
export interface ProvidedContext {
  workspace: string;
  user: string;
}

const WORKSPACE_HEADING = "# Workspace Context";
const USER_HEADING = "# User Context";
const GROUP_HEADING = "# Group Context";

// File-mode empty markers (local): the agent is told to write the files.
const FILE_WORKSPACE_EMPTY =
  "(empty so far. When the user shares anything about the company, product, " +
  "customers, or workspace conventions, write it to the file path below.)";
const FILE_USER_EMPTY =
  "(empty so far. When the user tells you about their role, goals, or how they " +
  "like to work, write it to the file path below.)";

// Cloud-mode marker: the user maintains these outside the chat.
const MANAGED_EMPTY = "(none provided.)";

function readOrEmpty(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    // A context file we cannot read is treated as empty rather than failing the
    // whole session start — the read is retried on the next chat.
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

/**
 * Build the "# Workspace Context" / "# User Context" section appended to an
 * agent's system prompt, or null when there is nothing to inject.
 *
 * When `provided` is set (CLOUD) the blobs come from the gateway (Supabase), the
 * user maintains them in the app, and the section is skipped entirely when both
 * are empty. When `provided` is omitted (LOCAL / self-host) the two files at the
 * workspace root are read instead; the section is always present for a real
 * agent workspace (one with a `.houston/` dir) so the agent knows the slots
 * exist and may write them, and is null for a dir that is not one (test/ad-hoc
 * working dirs are not polluted with stub paths).
 */
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

/**
 * Build the "# Group Context" section appended to an agent's system prompt from
 * `GROUP.md` at `cwd`, or null when there is nothing to inject.
 *
 * Unlike workspace/user context there is NO empty-marker stub and no `.houston`
 * gate: group membership is optional per-agent, and the host only writes
 * `GROUP.md` into an agent that actually belongs to a sidebar group. So the
 * file's mere presence with non-blank content is the whole signal — an ungrouped
 * agent (no file) or a group whose shared context is blank injects nothing.
 */
export function buildGroupContextSection(cwd: string): string | null {
  const groupPath = join(cwd, GROUP_MD);
  const content = readOrEmpty(groupPath).trim();
  if (!content) return null;
  return [
    GROUP_HEADING,
    "",
    content,
    "",
    "The section above is context shared by every agent in this agent's " +
      `sidebar group, loaded from the file at \`${groupPath}\`. Like ` +
      "WORKSPACE.md/USER.md it is an exception to your working-directory rule: " +
      "you may read and write it directly. But a person edits this group's " +
      "shared context from the sidebar, and doing so overwrites whatever you " +
      "wrote here, so treat it as theirs to own. Edits take effect on the next " +
      "chat.",
  ].join("\n");
}
