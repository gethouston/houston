export const ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

export function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`invalid '${field}'`);
  return v;
}

export const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
