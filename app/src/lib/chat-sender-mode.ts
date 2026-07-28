/**
 * Forces group-chat sender presentation only when the transcript proves that
 * someone besides the viewer participated. `undefined` preserves ui/chat's
 * distinct-author fallback without ever suppressing it with `false`.
 */
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
