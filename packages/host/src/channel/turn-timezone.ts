/** Replace client context with the scheduler zone, preserving absent-field bytes. */
export function stampTurnTimezone(
  body: Buffer,
  timezone: string | null,
): Buffer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return body;
  const { timezone: sent, ...fields } = parsed as Record<string, unknown>;
  if (!timezone && sent === undefined) return body;
  return Buffer.from(
    JSON.stringify({ ...fields, ...(timezone ? { timezone } : {}) }),
  );
}
