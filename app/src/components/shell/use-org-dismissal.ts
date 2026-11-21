import { useState } from "react";

export function useOrgDismissal(orgSlug: string | null) {
  const [dismissedIn, setDismissedIn] = useState<ReadonlySet<string | null>>(
    () => new Set(),
  );
  const dismiss = () => setDismissedIn((orgs) => new Set(orgs).add(orgSlug));
  return [dismissedIn.has(orgSlug), dismiss] as const;
}
