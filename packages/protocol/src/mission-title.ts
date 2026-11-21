export interface MissionTitleRequest {
  fallback: string;
  text: string;
}

export function parseMissionTitle(
  value: unknown,
): MissionTitleRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { fallback, text } = value as Record<string, unknown>;
  if (typeof fallback !== "string" || typeof text !== "string")
    return undefined;
  if (!fallback.trim() || !text.trim()) return undefined;
  return { fallback, text };
}
