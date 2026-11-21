import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";

export function OrgLockedNote() {
  const { locked, reason } = useOrgWriteLock();
  if (!locked) return null;
  return (
    <p
      data-testid="org-locked-note"
      className="mb-4 flex items-start gap-2 text-sm text-ink-muted"
    >
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
      {reason}
    </p>
  );
}

export function OrgLockedFieldset({ children }: { children: ReactNode }) {
  const { locked } = useOrgWriteLock();
  return (
    <>
      <OrgLockedNote />
      <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </>
  );
}
