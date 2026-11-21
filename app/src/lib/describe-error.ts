const SCALAR_FIELDS = ["kind", "code", "status", "name"] as const;
const MAX_FIELD = 80;
const MAX_KEYS = 12;

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err === null || typeof err !== "object") return String(err);
  const raw = err as Record<string, unknown>;
  if (typeof raw.message === "string") {
    return typeof raw.kind === "string"
      ? `${raw.kind}: ${raw.message}`
      : raw.message;
  }
  return summarize(raw);
}

function summarize(raw: Record<string, unknown>): string {
  const fields = SCALAR_FIELDS.flatMap((field) => {
    const value = raw[field];
    if (typeof value === "string") return [`${field}: ${clip(value)}`];
    if (typeof value === "number" || typeof value === "boolean") {
      return [`${field}: ${value}`];
    }
    return [];
  });
  const keys = Object.keys(raw);
  const listed = keys.slice(0, MAX_KEYS).join(", ");
  const more = keys.length > MAX_KEYS ? ", …" : "";
  const head = fields.length > 0 ? `object {${fields.join(", ")}}` : "object";
  return keys.length > 0 ? `${head} keys: ${listed}${more}` : head;
}

function clip(value: string): string {
  return value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD)}…` : value;
}
