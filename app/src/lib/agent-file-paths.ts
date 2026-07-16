/**
 * File paths reach the chat UI in three shapes:
 *
 *   1. Absolute, in the ENGINE host's native separator — Write/Edit tool
 *      inputs (`/Users/jo/.houston/workspaces/W/A/report.pdf` on macOS,
 *      `C:\Users\jo\...\W\A\report.pdf` on Windows engines).
 *   2. Workspace-relative with `/` — `file_changes` frames (see
 *      packages/runtime/src/session/file-changes.ts).
 *   3. Bare or `./`-prefixed relative — prose the agent drops right after
 *      writing a file (`perfil.md`, `./out/report.pdf`).
 *
 * The host's files routes (preview/download) accept only workspace-RELATIVE
 * paths, so everything funnels through `toWorkspaceRelative`. Deliberately
 * separator-agnostic: the engine may run on Windows while the viewer is a
 * browser anywhere.
 */

export interface AgentPathContext {
  /** The agent's route key on the TS engine (`Workspace/Agent`); the real
   * absolute directory on the legacy engine (HOU-677). */
  folderPath: string;
  /** Host-reported real directory (co-located hosts only). */
  localDir?: string;
}

/** Replace `\` with `/` so prefix comparisons work regardless of the engine OS. */
export function toPosixSeparator(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Last path segment, separator-agnostic (`a\b\c.md` and `a/b/c.md` → `c.md`). */
export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/**
 * Best-effort conversion of any engine-emitted path to workspace-relative.
 *
 * Strips, in order: the host-reported real directory (`localDir`), then the
 * `folderPath` as a prefix (legacy engine, where it IS the directory), then
 * `folderPath` as an infix — the TS engine's route key (`Workspace/Agent`)
 * appears verbatim inside every engine-side absolute path
 * (`~/.houston/workspaces/W/A/…` locally, `/data/workspaces/W/A/…` on cloud
 * pods). Already-relative paths pass through unchanged; an absolute path that
 * matches no root is returned as-is and left to the host to reject visibly.
 */
export function toWorkspaceRelative(
  rawPath: string,
  agent: AgentPathContext,
): string {
  let path = toPosixSeparator(rawPath.trim());
  while (path.startsWith("./")) path = path.slice(2);

  const roots = [agent.localDir, agent.folderPath]
    .filter((root): root is string => Boolean(root))
    .map((root) => toPosixSeparator(root).replace(/\/+$/, ""));

  for (const root of roots) {
    if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
    const marker = `/${root}/`;
    const at = path.indexOf(marker);
    if (at !== -1) return path.slice(at + marker.length);
  }
  return path;
}
