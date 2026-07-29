/**
 * The Files header: a band of chrome over the scrolling body.
 *
 *   row 1  utilities  — search (takes the row) + the New pill, the
 *                       download/reveal glyph, sort, view tabs (FilesToolbar)
 *   row 2  location   — the breadcrumb trail, ONLY in the grid and ONLY once
 *                       you are inside a folder        (FilesBreadcrumbs)
 *
 * The trail earns its row only when it has something to say. At the workspace
 * root it would repeat what the pane already shows, and the list view browses
 * the whole tree by expanding rows rather than by walking a path, so it has no
 * open folder to state. Both cases collapse the band to the toolbar alone.
 *
 * One wrapper carries FILES_CONTENT_COLUMN, so every row shares the gutter the
 * grid, list, skeletons and zero states use. The band draws NO floor: the page
 * is borderless, and the only hairlines on this screen are the list's row
 * separators. Spacing alone holds the band apart from the listing. It stays
 * put on an empty workspace too, so New never jumps away.
 */
import {
  FilesBreadcrumbs,
  type FilesBreadcrumbsProps,
} from "./files-breadcrumbs";
import { FilesToolbar, type FilesToolbarProps } from "./files-toolbar";

/**
 * Shared gutter so the header and the scroll body's content column align.
 * Full width on purpose: the file grid and list use every pixel of the pane.
 */
export const FILES_CONTENT_COLUMN = "w-full px-6";

export function FilesHeader({
  path,
  rootLabel,
  breadcrumbsLabel,
  onNavigate,
  onDragActive,
  ...toolbar
}: FilesToolbarProps & FilesBreadcrumbsProps) {
  const showTrail = toolbar.view === "grid" && path !== "";

  return (
    <div
      className={`${FILES_CONTENT_COLUMN} flex shrink-0 flex-col gap-1 pt-4 pb-3`}
    >
      <FilesToolbar {...toolbar} />
      {showTrail && (
        <FilesBreadcrumbs
          path={path}
          rootLabel={rootLabel}
          breadcrumbsLabel={breadcrumbsLabel}
          onNavigate={onNavigate}
          onDragActive={onDragActive}
        />
      )}
    </div>
  );
}
