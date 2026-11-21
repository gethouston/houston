export function captureFencingToken(
  fence: { token?: string },
  published: string | null,
): void {
  if (published === null || published === "") return;
  const next = Number(published);
  if (!Number.isSafeInteger(next)) return;
  const current = fence.token === undefined ? undefined : Number(fence.token);
  if (
    current === undefined ||
    !Number.isSafeInteger(current) ||
    next > current
  ) {
    fence.token = published;
  }
}
