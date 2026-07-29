/**
 * Name search in the Files toolbar. It fills its slot up to a CAP (`max-w-md`)
 * and stops: a field stretched across a 1400px window reads as a search engine,
 * not as a filter over the listing below it, and nobody types 400 characters of
 * filename. Past the cap the slack goes to the gutter between it and the
 * control cluster, which stays anchored to the pane's right edge, in line with
 * the listing's own right edge.
 *
 * It filters whatever the current view renders (the open folder's subtree in
 * the grid, the whole workspace in the list), and keeps its clear button
 * visible once there is something to clear, so the way back to the full listing
 * never hides behind a hover.
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
    <div className="relative w-full max-w-md min-w-0">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="h-9 rounded-full pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
