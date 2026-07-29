/**
 * Compact name search in the Files header. Filters the open folder's subtree;
 * the clear button is always visible once there is something to clear, so the
 * way back to the full listing never hides behind a hover.
 */
import { Input } from "@houston-ai/core";
import { Search, X } from "lucide-react";

export function FilesSearch({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  return (
    <div className="relative w-40 shrink-0 sm:w-56">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="h-8 rounded-full pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}
