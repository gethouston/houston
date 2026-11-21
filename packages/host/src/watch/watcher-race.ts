export function isBenignRecursiveWatchRace(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return (
    code === "ENOENT" &&
    typeof err.stack === "string" &&
    err.stack.includes("internal/fs/recursive_watch")
  );
}
