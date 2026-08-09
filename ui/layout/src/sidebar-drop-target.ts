import {
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from "@dnd-kit/core";
import {
  containerOfOverId,
  rawGroupId,
  type WorkingSection,
} from "./sidebar-dnd";

/**
 * Where the pointer is dropping: which droppable wins the collision, and which
 * container that droppable stands for.
 */

/**
 * Resolve any over-target id to the container (group id, or null default) it
 * belongs to, a group HEADER included — a collapsed block draws no rows, so its
 * header is the only thing a pointer can be over inside it.
 *
 * This answers "which block is under the cursor", never "may the drag land
 * there". An ITEM drag compares the answer against the block it started in and
 * refuses anything else (`useSidebarDragState`), so resolving a foreign header
 * is what makes that refusal visible rather than what lets a drop through.
 */
export function overContainerId(
  working: WorkingSection[],
  overId: string,
): string | null | undefined {
  // The ungrouped section's own sortable node ("grp:__default__") must resolve
  // to the null default container, not the literal "__default__" string — else
  // dropping over the empty ungrouped area targets a container that doesn't
  // exist (no highlight, and the agent is lost).
  if (overId === "grp:__default__") return null;
  const grp = rawGroupId(overId);
  if (grp !== null) return grp;
  return containerOfOverId(working, overId);
}

/**
 * Pointer-first collision that PREFERS the item directly under the cursor over
 * any container. `closestCorners` kept snapping to a spatially-near group, so
 * top-level agents couldn't be reordered and an agent couldn't be dragged out
 * of a group. With pointer-within + item preference, the drop target is exactly
 * what the cursor is over; empty areas (a group, the drop-out zone) fall through
 * to the container.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const hits = pointer.length > 0 ? pointer : rectIntersection(args);
  const item = hits.find((h) => String(h.id).startsWith("item:"));
  return item ? [item] : hits;
};
