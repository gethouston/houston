import { useState } from "react";

/**
 * A routine prompt's dismissal, held for the org it was dismissed in: each org
 * has its own routines, so switching to another org asks again.
 */
export function useOrgDismissal(orgSlug: string | null) {
  const [dismissedIn, setDismissedIn] = useState<string | null>();
  return [dismissedIn === orgSlug, () => setDismissedIn(orgSlug)] as const;
}
