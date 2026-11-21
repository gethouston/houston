export function isBenignAbortRejection(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  return (
    name === "AbortError" &&
    typeof message === "string" &&
    /^fetch is aborted/i.test(message)
  );
}

export function isBenignLockRejection(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;

  if ((reason as { isAcquireTimeout?: unknown }).isAcquireTimeout === true) {
    return true;
  }

  const message = (reason as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("stolen by another request") ||
    normalized.includes("broken by another request") ||
    normalized.includes("another request stole it")
  );
}
