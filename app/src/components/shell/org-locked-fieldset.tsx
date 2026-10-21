import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";

/**
 * Turns off every control inside while the active org is locked, with the
 * reason above them. The text and values stay readable: a locked org
 * refuses writes, not reads. The fieldset is always rendered, so locking
 * never remounts what it wraps.
 */
export function OrgLockedFieldset({ children }: { children: ReactNode }) {
  const { locked, reason } = useOrgWriteLock();
  return (
    <>
      {locked && (
        <p
          data-testid="org-locked-note"
          className="mb-4 flex items-start gap-2 text-sm text-ink-muted"
        >
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {reason}
        </p>
      )}
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </>
  );
}
