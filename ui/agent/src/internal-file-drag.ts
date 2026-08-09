export function internalDragPayload(path: string, scope?: string): string {
  return JSON.stringify({ path, scope });
}

export function parseInternalDragPayload(value: string): {
  path: string;
  scope?: string;
} {
  const payload = JSON.parse(value) as { path?: unknown; scope?: unknown };
  if (typeof payload.path !== "string") throw new Error("Invalid file drag");
  if (payload.scope !== undefined && typeof payload.scope !== "string")
    throw new Error("Invalid file drag scope");
  return payload as { path: string; scope?: string };
}

export function resolveInternalMoveTarget(
  resolveTargetFolder?: () => string | undefined,
): string | null {
  return resolveTargetFolder?.() ?? null;
}
