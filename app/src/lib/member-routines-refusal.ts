/**
 * The two refusals this read can meet while the dialog is open, neither a
 * Houston bug: another owner removed the person first (404), or the caller is
 * no longer an owner (403). The dialog's neutral note covers both.
 */
export function isExpectedMemberRoutinesRefusal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  return status === 403 || status === 404;
}
