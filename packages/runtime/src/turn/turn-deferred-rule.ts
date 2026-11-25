export const STARTUP_FOLDERS: ReadonlySet<string> = new Set([
  ".houston",
  ".agents",
  ".claude",
  ".pi",
]);

// WHY: Must stay identical to the gateway's prefetch predicate. ADR-0015
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
