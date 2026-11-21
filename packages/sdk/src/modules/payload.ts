export function field(payload: unknown, key: string): unknown {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

export function requireString(payload: unknown, key: string): string {
  const value = field(payload, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

export function requireBoolean(payload: unknown, key: string): boolean {
  const value = field(payload, key);
  if (typeof value !== "boolean") {
    throw new Error(`'${key}' must be true or false`);
  }
  return value;
}

export function requireStrings(payload: unknown, key: string): string[] {
  const value = field(payload, key);
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(`'${key}' must be an array of ids`);
  }
  return value as string[];
}
