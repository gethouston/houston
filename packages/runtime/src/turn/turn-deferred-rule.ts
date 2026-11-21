export const STARTUP_FOLDERS: ReadonlySet<string> = new Set([
  ".houston",
  ".agents",
  ".claude",
  ".pi",
]);

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
