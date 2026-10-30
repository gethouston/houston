import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The SDK's project-slug scheme: the session cwd with every non-alphanumeric
 * character replaced by `-` (verified against the dirs the SDK writes, e.g.
 * `/Users/x/.h/ws/Agent 3` → `-Users-x--h-ws-Agent-3`). If the SDK ever
 * changes the scheme, relocation targets a dir it ignores and resume fails —
 * which the session-level fresh-retry (session.ts) then absorbs, so drift
 * degrades to today's start-fresh behavior, never a wedge.
 */
export function sdkProjectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

/** The full path of a `<sessionId>.jsonl` transcript under `projectsDir`, if any. */
export function locateTranscript(
  projectsDir: string,
  sessionId: string,
): string | undefined {
  if (!existsSync(projectsDir)) return undefined;
  const file = `${sessionId}.jsonl`;
  const top = join(projectsDir, file);
  const candidates = existsSync(top) ? [top] : [];
  for (const entry of readdirSync(projectsDir)) {
    const nested = join(projectsDir, entry, file);
    if (existsSync(nested)) candidates.push(nested);
  }
  return candidates
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort(
      (left, right) =>
        right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path),
    )[0]?.path;
}

/**
 * Delete a session's `<sessionId>.jsonl` transcript wherever it sits under
 * `projectsDir` (top level or inside a project-slug subdir) — the delete-side
 * mirror of `transcriptExists`, so both share one view of the SDK's layout
 * instead of chat.ts reconstructing the project-slug scheme.
 */
export function removeTranscript(projectsDir: string, sessionId: string): void {
  if (!existsSync(projectsDir)) return;
  const file = `${sessionId}.jsonl`;
  rmSync(join(projectsDir, file), { force: true });
  for (const entry of readdirSync(projectsDir)) {
    rmSync(join(projectsDir, entry, file), { force: true });
  }
}
