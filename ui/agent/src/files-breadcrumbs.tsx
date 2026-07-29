/**
 * Row 2 of the Files header: the path trail, on a row of its own. It belongs
 * to the GRID, which is the only view that navigates folder by folder, and
 * only once you are inside one — at the root the trail would say nothing the
 * pane does not already say, and the band is quieter as a single row (see
 * FilesHeader). The list view browses the whole tree by expansion instead, so
 * it has no location to state. Every crumb is a drop target so a drag can move
 * items to any ancestor ("" signals the root); the open folder is the
 * emphasized final crumb.
 */
import { ChevronRight, House } from "lucide-react";
import { CrumbButton } from "./crumb-button";
import { crumbsForPath } from "./grid-utils";

export interface FilesBreadcrumbsProps {
  path: string;
  /** First crumb (the workspace root), e.g. the agent's name. */
  rootLabel: string;
  /** Accessible name for the navigation landmark. */
  breadcrumbsLabel: string;
  onNavigate: (path: string) => void;
  /** "" = root hovered, null = nothing hovered (see FilesBrowser). */
  onDragActive: (folder: string | null) => void;
}

export function FilesBreadcrumbs({
  path,
  rootLabel,
  breadcrumbsLabel,
  onNavigate,
  onDragActive,
}: FilesBreadcrumbsProps) {
  const crumbs = crumbsForPath(path);

  return (
    <nav
      aria-label={breadcrumbsLabel}
      className="flex h-9 min-w-0 items-center gap-0.5"
    >
      <CrumbButton
        crumb={{ name: rootLabel, path: "" }}
        current={crumbs.length === 0}
        droppable
        onNavigate={onNavigate}
        onDragActive={onDragActive}
        icon={<House aria-hidden className="size-4 shrink-0" />}
      />
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-ink-muted/60"
          />
          <CrumbButton
            crumb={crumb}
            current={i === crumbs.length - 1}
            droppable
            onNavigate={onNavigate}
            onDragActive={onDragActive}
          />
        </span>
      ))}
    </nav>
  );
}
