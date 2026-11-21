import type { ReadOperation } from "./assistant-collect.ts";
import { routeKey } from "./assistant-collect.ts";

export interface ClaimOutcome {
  published: ReadOperation[];
  shadowed: ReadOperation[];
}

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
