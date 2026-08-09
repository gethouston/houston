/**
 * RoutineRowTitle — a row's name line.
 *
 * It stopped being one string the moment a list could span several agents: a
 * cross-agent surface (a team's Routines) passes an OWNER chip, and "whose
 * routine is this" is as load-bearing there as what the routine is called. So
 * the name truncates and the chip never does. A single-agent list passes no
 * chip and the line is exactly the paragraph it always was.
 */
import type { ReactNode } from "react";

export function RoutineRowTitle({
  name,
  ownerChip,
}: {
  name: string;
  /** The owning agent's chip, for a list that spans several agents. */
  ownerChip?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="truncate text-[13px] font-medium leading-tight text-ink">
        {name}
      </p>
      {ownerChip && <span className="shrink-0">{ownerChip}</span>}
    </div>
  );
}
