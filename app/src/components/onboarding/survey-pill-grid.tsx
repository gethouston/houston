import { cn } from "@houston-ai/core";

export interface SurveyPillOption<T extends string> {
  id: T;
  label: string;
}

/**
 * The choice grid shared by the survey's job and industry questions: three
 * columns of bordered pills on the white setup card, modeled on the ChatGPT
 * desktop segmentation screen.
 */
export function SurveyPillGrid<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: readonly SurveyPillOption<T>[];
  selected: T | null;
  onSelect: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid w-full max-w-xl grid-cols-2 gap-2.5 md:grid-cols-3">
      {options.map((option) => (
        <SurveyPill
          key={option.id}
          label={option.label}
          selected={selected === option.id}
          onSelect={() => onSelect(option.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/**
 * One choice in the grid: a bordered pill with a centered label. Selection is
 * Houston-monochrome and always visible without hovering — the ink border plus
 * a faint ink wash carry it (no hover-only affordances, no decorative accent
 * color).
 */
function SurveyPill({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border px-3 py-3 text-center text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus",
        disabled && "cursor-not-allowed opacity-50",
        selected
          ? "border-ink bg-ink/[0.08] font-medium text-ink"
          : "border-ink/15 text-ink",
        !disabled && !selected && "hover:bg-ink/[0.04]",
      )}
    >
      {label}
    </button>
  );
}
