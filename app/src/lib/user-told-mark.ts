const TOLD_USER = Symbol.for("houston.error.toldUser");

export function markToldUser(err: unknown): void {
  if (!err || typeof err !== "object" || !Object.isExtensible(err)) return;
  (err as Record<symbol, unknown>)[TOLD_USER] = true;
}

export function wasToldUser(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as Record<symbol, unknown>)[TOLD_USER] === true
  );
}
