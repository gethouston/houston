/**
 * What a team section's per-agent fan-out reduces to.
 *
 * `useQueries` hands back a FRESH results array on every render, and every
 * result object with it. A section that merged straight off that array rebuilt
 * its list each render, and everything downstream that memoizes on the list —
 * the shared trigger view model's `useMemo`s and, worse, the timeout effect
 * that stops a trigger row saying "verifying" forever — re-armed each render
 * too. Reducing the results to PLAIN DATA inside `combine` fixes that at the
 * source: React Query runs the combine through its own structural sharing, so
 * an unchanged fleet hands back the SAME object, and a `useMemo` over it
 * finally holds. (The same shape the workspace-skills fan-out uses.)
 *
 * Deliberately data only — no `refetch` closures. A section retries through the
 * query client with the failed agents' own keys, which is both stable and more
 * precise than re-entering an observer.
 */

/** One reduced fan-out: index i is the i-th agent the section asked. */
export interface TeamFanOut<T> {
  /** That agent's answer, `undefined` while it is loading or has failed. */
  data: (T | undefined)[];
  /** That agent's read error, `undefined`/`null` when it answered. */
  errors: unknown[];
  /** That agent's read is in flight (initial load or a retry). */
  fetching: boolean[];
  /** No agent has answered yet — the section's own loading state. */
  loading: boolean;
}

/** The `useQueries` result fields {@link teamFanOut} reads. */
interface TeamFanOutResult<T> {
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
}

/** Reduce a fan-out's results to plain data. Pass as `useQueries`' `combine`. */
export function teamFanOut<T>(
  results: readonly TeamFanOutResult<T>[],
): TeamFanOut<T> {
  return {
    data: results.map((r) => r.data),
    errors: results.map((r) => r.error),
    fetching: results.map((r) => r.isFetching),
    loading: results.some((r) => r.isLoading),
  };
}
