import type { ReactNode } from "react";

export function RoutineRowTitle({
  name,
  warningChip,
}: {
  name: string;
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
