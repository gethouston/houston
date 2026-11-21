export function identityChanged(
  prevUserId: string | null,
  nextUserId: string | null,
): boolean {
  return prevUserId !== null && prevUserId !== nextUserId;
}
