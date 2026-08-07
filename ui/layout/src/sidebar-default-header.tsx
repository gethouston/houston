import { sidebarGroupClasses } from "./sidebar-classes";

export interface SidebarDefaultHeaderProps {
  name: string;
  /** Resolved count shown beside the name, as on a group header. */
  count: number;
}

/**
 * The default block's header. It reads as a peer of the group headers above it
 * (same line, same type, same count) but carries none of their affordances:
 * the block stands for the container itself, so there is nothing here to fold,
 * rename or delete, and a hover fill would promise a click that does nothing.
 * A caret-sized spacer keeps the name on the same optical column as the group
 * names, which is what makes the list read as one ladder rather than two.
 */
export function SidebarDefaultHeader({
  name,
  count,
}: SidebarDefaultHeaderProps) {
  return (
    <div
      data-sidebar-default-header=""
      className={sidebarGroupClasses.staticHeader}
    >
      <span className={sidebarGroupClasses.caretSpacer} aria-hidden="true" />
      <span className={sidebarGroupClasses.staticName}>{name}</span>
      <span className={sidebarGroupClasses.staticCount}>{count}</span>
    </div>
  );
}
