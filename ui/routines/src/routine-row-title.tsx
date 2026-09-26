/**
 * RoutineRowTitle — a row's name line.
 *
 * A WARNING chip rides the line when the surface says this routine cannot run
 * as configured (its AI account is disconnected or out of credits). The name
 * truncates and the chip never does: a warning that gets cut off is not a
 * warning.
 */
import type { ReactNode } from "react";

export function RoutineRowTitle({
  name,
  warningChip,
}: {
  name: string;
  /** Surface-supplied warning that this routine cannot run as configured. */
  warningChip?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="truncate text-[13px] font-medium leading-tight text-ink">
        {name}
      </p>
      {warningChip && <span className="shrink-0">{warningChip}</span>}
    </div>
  );
}
