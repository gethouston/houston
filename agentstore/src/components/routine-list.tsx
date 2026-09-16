import type { StoreRoutineRow } from "@houston-ai/store";

/**
 * The agent page's Routines section: what the agent does on its own, and what
 * sets each one off. Two quiet lines per row, same chip surface as the Skills
 * rows, and nothing to click — a routine has no body to inspect, and the
 * install panel is where the page asks for an action.
 */
export function RoutineList({ routines }: { routines: StoreRoutineRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {routines.map((routine) => (
        <li
          className="flex flex-col gap-1 rounded-2xl bg-chip-subtle px-5 py-4"
          key={routine.id}
        >
          <span className="truncate font-medium text-[15px] text-ink">
            {routine.name}
          </span>
          <span className="text-[14px] text-ink-muted">
            {routine.wakeLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}
