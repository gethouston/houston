/** Hidden agent folders read before any tool runs: Houston's state and
 *  runtime inputs, the agent's skills, and harness settings (pi builds its
 *  settings from `.pi/settings.json` when the session starts). */
export const STARTUP_FOLDERS: ReadonlySet<string> = new Set([
  ".houston",
  ".agents",
  ".claude",
  ".pi",
]);

/**
 * The agent's own files: anything under a folder of the agent directory
 * (`workspaces/<ws>/<agent>/<dir>/**`) other than the startup folders. That
 * covers chat attachments (`uploads/`, host turn/attachments.ts), every
 * document the person or the agent made, and the hidden folders the agent's
 * tools fill (git clones, virtualenvs, caches), which together are most of a
 * large agent's objects and bytes. No runtime input lives there: the prompt
 * and the harness read the agent's root context files (CLAUDE.md, AGENTS.md)
 * and the startup folders, which stay on the critical path. Only a turn's
 * tools read these files, so a claimed turn hydrates them behind the prompt
 * (turn-deferred-files.ts). The gateway leaves the same objects out of the
 * turn's inlined prefetch (cloud internal/pooldispatch/prefetch.go), so they
 * never sit on the upload the worker's answer waits for. Keep the two
 * predicates identical.
 */
export function deferredWorkspaceFile(rel: string): boolean {
  const segments = rel.split("/");
  const dir = segments[3];
  return (
    segments.length > 4 &&
    segments[0] === "workspaces" &&
    dir !== undefined &&
    dir !== "" &&
    !STARTUP_FOLDERS.has(dir)
  );
}
