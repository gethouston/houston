export interface PushPayload {
  v: "1";
  type: "turn_settled" | "mentioned";
  org: string;
  agent: string;
  conversation: string;
  mission: string;
  reason: string;
  event: string;
}

/** Unknown native plugin data never reaches navigation without C23's shape. */
export function parsePushPayload(value: unknown): PushPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (
    data.v !== "1" ||
    (data.type !== "turn_settled" && data.type !== "mentioned") ||
    typeof data.org !== "string" ||
    !data.org ||
    typeof data.agent !== "string" ||
    !data.agent ||
    typeof data.conversation !== "string" ||
    !data.conversation ||
    typeof data.mission !== "string" ||
    typeof data.reason !== "string" ||
    typeof data.event !== "string" ||
    !data.event
  )
    return null;
  return data as unknown as PushPayload;
}

export function pushPayloadOrReport(
  value: unknown,
  report: (error: Error) => void,
): PushPayload | null {
  const payload = parsePushPayload(value);
  if (!payload) report(new Error("Unknown push notification payload"));
  return payload;
}
