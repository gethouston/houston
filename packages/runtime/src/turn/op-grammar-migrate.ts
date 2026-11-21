export interface MigrateOp {
  kind: "migrate";
  version: number;
  ownerSub?: string;
}

export function parseMigrateOp(raw: Record<string, unknown>): MigrateOp {
  const { version, ownerSub } = raw;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw new Error("invalid 'op.version'");
  if (ownerSub !== undefined && (typeof ownerSub !== "string" || !ownerSub))
    throw new Error("invalid 'op.ownerSub'");
  return {
    kind: "migrate",
    version,
    ...(typeof ownerSub === "string" ? { ownerSub } : {}),
  };
}
