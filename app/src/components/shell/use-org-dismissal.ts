import { useState } from "react";

/**
 * A routine prompt's dismissals, held per org: each org has its own routines,
 * so an org the prompt was not dismissed in asks again.
 */
export function useOrgDismissal(orgSlug: string | null) {
  const [dismissedIn, setDismissedIn] = useState<ReadonlySet<string | null>>(
    () => new Set(),
  );
  const dismiss = () => setDismissedIn((orgs) => new Set(orgs).add(orgSlug));
  return [dismissedIn.has(orgSlug), dismiss] as const;
}
