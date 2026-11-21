import type { LocalWriteLock } from "@houston/runtime-client/object-sync";

const queues = new Map<string, Promise<void>>();

export function withRunsFile<T>(
  root: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = queues.get(root) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(root, tail);
  void tail.then(() => {
    if (queues.get(root) === tail) queues.delete(root);
  });
  return run;
}

const RUNS_FILE = "/.houston/routine_runs/routine_runs.json";

export function storeSyncRunsLock(workspacesDir: string): LocalWriteLock {
  const prefix = `${workspacesDir}/`;
  return (relativePath, write) =>
    relativePath.startsWith(prefix) && relativePath.endsWith(RUNS_FILE)
      ? withRunsFile(
          relativePath.slice(prefix.length, -RUNS_FILE.length),
          write,
        )
      : write();
}
