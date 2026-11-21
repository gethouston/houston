export type EnvelopeLike = readonly [
  { event_id?: string } & Record<string, unknown>,
  ...unknown[],
];

export function isAcceptedStatus(statusCode: number | undefined): boolean {
  return statusCode !== undefined && statusCode >= 200 && statusCode < 300;
}

export function eventIdFromEnvelope(
  envelope: EnvelopeLike,
): string | undefined {
  const header = envelope[0];
  return typeof header?.event_id === "string" ? header.event_id : undefined;
}

export function resolveCapturedEventId(
  eventId: string,
  flushed: boolean,
  accepted: boolean,
): string {
  return flushed && accepted ? eventId : "";
}
