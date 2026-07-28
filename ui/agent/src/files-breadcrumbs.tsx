/**
 * The header's path trail. Shown in both views (each is scoped to the open
 * folder, so location context always applies). Every crumb is a drop target
 * so a drag can move items to any ancestor ("" signals the root). At the root
 * there is nothing to trail, so it collapses to the header's flexible spacer.
 */
import { ChevronRight, House } from "lucide-react";
import { CrumbButton } from "./crumb-button";
import { crumbsForPath } from "./grid-utils";

export function FilesBreadcrumbs({
  path,
  rootLabel,
  label,
  onNavigate,
  onDragActive,
}: {
  path: string;
  /** First crumb (the workspace root), e.g. the agent's name. */
  rootLabel: string;
  /** Accessible name for the navigation landmark. */
  label: string;
  onNavigate: (path: string) => void;
  /** "" = root hovered, null = nothing hovered (see FilesBrowser). */
  onDragActive: (folder: string | null) => void;
}) {
  const crumbs = crumbsForPath(path);
  if (crumbs.length === 0) return <div className="min-w-0 flex-1" />;

  return (
    <nav
      aria-label={label}
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
        <span key={crumb.path} className="flex min-w-0 items-center gap-0.5">
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
  );
}
