/**
 * Files toolbar: breadcrumb navigation on the left (only while inside a
 * folder — the surrounding page already names the agent, so the root is a
 * home glyph, not a title), sort menu and the grid/list view toggle on the
 * right. Breadcrumbs are drop targets so a drag can move items to any
 * ancestor ("" signals the root).
 */
import { cn } from "@houston-ai/core";
import {
  ChevronRight,
  FolderPlus,
  House,
  LayoutGrid,
  List,
} from "lucide-react";
import { CrumbButton } from "./crumb-button";
import { crumbsForPath } from "./grid-utils";
import { SortMenu, type SortMenuLabels } from "./sort-menu";
import type { FilesViewMode } from "./types";
import type { SortDirection, SortKey } from "./utils";

export function FilesToolbar({
  view,
  onViewChange,
  path,
  rootLabel,
  onNavigate,
  onDragActive,
  sortKey,
  sortDir,
  onSort,
  sortLabels,
  viewGridLabel,
  viewListLabel,
  breadcrumbsLabel,
  onNewFolder,
  newFolderLabel,
}: {
  view: FilesViewMode;
  onViewChange: (view: FilesViewMode) => void;
  path: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
  /** "" = root hovered, null = nothing hovered (see FilesBrowser). */
  onDragActive: (folder: string | null) => void;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  sortLabels: SortMenuLabels;
  viewGridLabel: string;
  viewListLabel: string;
  breadcrumbsLabel: string;
  onNewFolder?: () => void;
  newFolderLabel: string;
}) {
  const crumbs = crumbsForPath(path);
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
      {view === "grid" && crumbs.length > 0 ? (
        <nav
          aria-label={breadcrumbsLabel}
          className="flex min-w-0 flex-1 items-center gap-0.5"
        >
          <CrumbButton
            crumb={{ name: rootLabel, path: "" }}
            current={false}
            droppable
            onNavigate={onNavigate}
            onDragActive={onDragActive}
          >
            <House aria-hidden className="size-3.5 shrink-0" />
          </CrumbButton>
          {crumbs.map((crumb, i) => (
            <span
              key={crumb.path}
              className="flex min-w-0 items-center gap-0.5"
            >
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-ink-muted/60"
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
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {onNewFolder && (
        <button
          type="button"
          aria-label={newFolderLabel}
          title={newFolderLabel}
          onClick={onNewFolder}
          className="shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <FolderPlus aria-hidden className="size-4" />
        </button>
      )}
      {view === "grid" && (
        <SortMenu
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          labels={sortLabels}
        />
      )}
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line p-0.5">
        <ViewToggleButton
          active={view === "list"}
          label={viewListLabel}
          onClick={() => onViewChange("list")}
        >
          <List aria-hidden className="size-3.5" />
        </ViewToggleButton>
        <ViewToggleButton
          active={view === "grid"}
          label={viewGridLabel}
          onClick={() => onViewChange("grid")}
        >
          <LayoutGrid aria-hidden className="size-3.5" />
        </ViewToggleButton>
      </div>
    </div>
  );
}

function ViewToggleButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md p-1 transition-colors",
        active
          ? "bg-chip-solid text-ink"
          : "text-ink-muted hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
