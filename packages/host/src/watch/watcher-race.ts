/**
 * Node's recursive `fs.watch` on Linux is implemented in JS
 * (`node:internal/fs/recursive_watch`): it re-scans directories with
 * `readdirSync` when entries change. A transient directory deleted between the
 * change event and the scan — pi's `auth.json.lock` lock dir (created/removed
 * around every credential refresh by `@earendil-works/pi-coding-agent`
 * AuthStorage, not configurable) is the frequent case — throws ENOENT from
 * inside Node's internals: no app frame, and no watcher `error` handler ever
 * sees it, so it can only surface as an uncaughtException
 * (HOUSTON-APP issue 7614029702, ~10/day across pods).
 *
 * The race is harmless — the watcher re-scans on the next event and the
 * store-sync daemon additionally has a periodic-sync fallback — so the host
 * demotes exactly this signature to a warning breadcrumb instead of a Sentry
 * error event. Everything else stays loud (beta no-silent-failures policy).
 */
export function isBenignRecursiveWatchRace(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return (
    code === "ENOENT" &&
    typeof err.stack === "string" &&
    err.stack.includes("internal/fs/recursive_watch")
  );
}
