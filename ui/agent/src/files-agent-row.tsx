/** A team agent rendered as the root folder of its workspace. */
import { cn, FolderGlyph } from "@houston-ai/core";
import type { ReactNode } from "react";
import {
  ACTIONS_CELL,
  colGrid,
  LIST_INSET,
  META_CELL,
  META_TEXT,
  NAME_CELL_INNER,
  NAME_TEXT,
  ROW_CLASS,
  ROW_MARK,
  ROW_TILE_GLYPH,
} from "./files-list-chrome";
import { DisclosureChevron, RowIndent } from "./files-list-indent";

export function FilesAgentRow({
  name,
  avatar,
  countLabel,
  expanded,
  onToggle,
  actions,
  expandLabel,
  collapseLabel,
  folderClassName,
}: {
  name: string;
  avatar: ReactNode;
  countLabel?: string;
  expanded: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  expandLabel: string;
  collapseLabel: string;
  folderClassName?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: CSS grid layout requires a div; role="row" preserves the list semantics.
    <div
      role="row"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={expanded ? collapseLabel : expandLabel}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      // No w-full here: the row's width must come from the -mx-2 inset margins
      // (auto width absorbs them), exactly like the rows container — an
      // explicit 100% width would land the actions column 16px left of the
      // file rows' kebabs.
      className={cn(ROW_CLASS, LIST_INSET, "text-left")}
      style={{ display: "grid", gridTemplateColumns: colGrid() }}
    >
      <div className="flex h-full min-w-0 items-center">
        <RowIndent depth={0} />
        <DisclosureChevron open={expanded} className="mr-1" />
        <div className={NAME_CELL_INNER}>
          <span className={cn("relative", ROW_MARK)}>
            <FolderGlyph
              small
              className={cn(ROW_TILE_GLYPH, folderClassName)}
            />
            {/* The disc hugs the avatar exactly: an opaque backdrop so the
                folder's lines never bleed through the translucent avatar fill,
                without a ring protruding past it. */}
            <span className="absolute -right-0.5 -bottom-0.5 flex rounded-full bg-background transition-colors group-hover/row:bg-hover">
              {avatar}
            </span>
          </span>
          <span className={cn("min-w-0 truncate", NAME_TEXT)}>{name}</span>
          {countLabel && (
            <span className={cn("shrink-0 tabular-nums", META_TEXT)}>
              {countLabel}
            </span>
          )}
        </div>
      </div>
      <span className={META_CELL} />
      <span className={META_CELL} />
      {/* The action cell intercepts bubbled menu gestures so they never fold
          the owning folder row. Its child remains the semantic control. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: propagation boundary around the nested action control */}
      <span
        className={ACTIONS_CELL}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {actions}
      </span>
    </div>
  );
}
