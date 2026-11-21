export function isTransientEngineError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status >= 500;
  return err instanceof TypeError;
}
