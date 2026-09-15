import type { ReadOperation } from "./assistant-collect.ts";
import { routeKey } from "./assistant-collect.ts";

/**
 * Which SDK operation PUBLISHES a route when several resolve to the same one.
 *
 * An SDK module reaches one host route from two names on purpose: a no-refetch
 * write primitive and the refetching facade op that delegates to it both end at
 * `GET /agents/{agentId}/auth/status`. Only one of them can be the catalog's
 * entry for that route, and leaving the choice to whichever name the facade
 * walk happens to reach first means a reordered `return {}` block silently
 * swaps a callable operation for its hidden twin, with a green build.
 *
 * So visibility decides, never order: the operation the assistant is allowed to
 * dispatch is the one that survives. Two claimants of the SAME visibility is
 * not a tie this generator may break on its own, so both are handed to the
 * coverage gate instead.
 */

export interface ClaimOutcome {
  /** The reads whose operation belongs in the catalog. */
  published: ReadOperation[];
  /**
   * Reads a canonical claimant already covers. Dropped from the CATALOG only:
   * they are still functions on the SDK surface, so the gate still judges them.
   */
  shadowed: ReadOperation[];
}

/** The same read with the conflict its annotation must carry to the gate. */
function withConflict(
  read: ReadOperation,
  route: string,
  claimants: readonly string[],
): ReadOperation {
  return {
    ...read,
    annotation: {
      ...read.annotation,
      routeConflict: {
        route,
        others: claimants.filter((name) => name !== read.operation.name),
      },
    },
  };
}

export function claimRoutes(
  reads: readonly ReadOperation[],
  /** Routes the canonical adapter copy already publishes. */
  claimedElsewhere: ReadonlySet<string>,
): ClaimOutcome {
  const outcome: ClaimOutcome = { published: [], shadowed: [] };
  const byRoute = new Map<string, ReadOperation[]>();
  for (const read of reads) {
    const key = routeKey(read.operation);
    if (key === null) outcome.published.push(read);
    else if (claimedElsewhere.has(key)) outcome.shadowed.push(read);
    else byRoute.set(key, [...(byRoute.get(key) ?? []), read]);
  }
  for (const [route, claimants] of byRoute) {
    const [only] = claimants;
    if (claimants.length === 1) {
      outcome.published.push(only);
      continue;
    }
    const visible = claimants.filter((read) => !read.operation.hidden);
    if (visible.length === 1) {
      for (const read of claimants)
        (read === visible[0] ? outcome.published : outcome.shadowed).push(read);
      continue;
    }
    const names = claimants.map((read) => read.operation.name);
    for (const read of claimants)
      (read === only ? outcome.published : outcome.shadowed).push(
        withConflict(read, route, names),
      );
  }
  return outcome;
}
