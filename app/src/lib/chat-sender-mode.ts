export function chatSenderMode(
  authorIds: string[],
  viewerUserId: string | undefined,
  multiplayer: boolean,
): true | undefined {
  if (!multiplayer) return undefined;

  const distinctAuthorIds = new Set(authorIds);
  if (
    (viewerUserId !== undefined &&
      authorIds.some((authorId) => authorId !== viewerUserId)) ||
    distinctAuthorIds.size >= 2
  ) {
    return true;
  }

  return undefined;
}
