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
import { CatalogSearchField } from "@houston-ai/core";

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
    <div className="w-full max-w-md min-w-0">
      <CatalogSearchField
        value={value}
        onChange={onChange}
        label={placeholder}
        clearLabel={clearLabel}
      />
    </div>
  );
}
