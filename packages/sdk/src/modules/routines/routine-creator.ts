/**
 * Whether the signed-in viewer is the person a routine fires as. A fired
 * routine runs on its CREATOR's credential and is judged on its creator's
 * plan, so anything the viewer's own probe or plan says describes the routine
 * only when this holds.
 *
 * True when the routine names the viewer, or names no creator at all (an
 * Agent Store install or an import strips `created_by`; the one account of a
 * single-player space is the viewer's, and the next save stamps whoever
 * saves). A routine naming someone else is false, and so is one naming anyone
 * while the session is still loading (`viewerId` null).
 */
export function viewerIsRoutineCreator(
  createdBy: string | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (!createdBy) return true;
  return !!viewerId && createdBy === viewerId;
}
