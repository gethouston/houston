import { posix } from "node:path";
import { docKey } from "@houston/domain";
import { agentScopeIncludes } from "./turn-agent-scope";

/** Build the object scope owned by one claimed conversation turn. */
export function claimedTurnIncludes(
  dataRel: string,
  workspaceRel: string,
  conversationId: string,
): (relativePath: string) => boolean {
  const conversation = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(conversationId)}.json`,
  );
  // The transcript's archive segments (store/conversation-archive.ts) belong
  // to the same turn as its live file.
  const archive = posix.join(
    dataRel,
    "conversations",
    `${encodeURIComponent(conversationId)}.archive/`,
  );
  const session = posix.join(dataRel, "sessions", conversationId);
  const activity = turnActivityKey(workspaceRel);
  const runs = turnRoutineRunsKey(workspaceRel);
  return (relativePath) =>
    relativePath === conversation ||
    relativePath.startsWith(archive) ||
    turnSessionScopeIncludes(session, relativePath) ||
    relativePath === activity ||
    relativePath === runs ||
    agentScopeIncludes(relativePath, workspaceRel);
}

/** Keep ordinary session state, but only durable files from the Claude CLI. */
export function turnSessionScopeIncludes(
  sessionRel: string,
  relativePath: string,
): boolean {
  if (!relativePath.startsWith(`${sessionRel}/`)) return false;
  if (relativePath === `${sessionRel}/harness.json`) return true;
  const claudePrefix = `${sessionRel}/claude/`;
  if (!relativePath.startsWith(claudePrefix)) return true;
  const claudeRel = relativePath.slice(claudePrefix.length);
  return claudeRel === "sessions.json" || claudeRel.startsWith("projects/");
}

/** Store-relative mission-board object granted to a claimed turn. */
export const turnActivityKey = (workspaceRel: string): string =>
  docKey(workspaceRel, "activity");

/** Store-relative routine-runs object granted to a claimed turn. */
export const turnRoutineRunsKey = (workspaceRel: string): string =>
  docKey(workspaceRel, "routine_runs");
