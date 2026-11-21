export function viewerIsRoutineCreator(
  createdBy: string | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (!createdBy) return true;
  return !!viewerId && createdBy === viewerId;
}
