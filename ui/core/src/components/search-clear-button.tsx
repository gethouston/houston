import { X } from "lucide-react";

/** A compact clear affordance for search fields. */
export function SearchClearButton({
  label = "Clear search",
  onClear,
}: {
  label?: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink"
      aria-label={label}
    >
      <X className="size-3.5" />
    </button>
  );
}
