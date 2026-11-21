export function isExpectedMemberRoutinesRefusal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  return status === 403 || status === 404;
}
