/**
 * Hard caps on the routine turn's trigger-event block, enforced at the wire
 * boundary. The control plane truncates payloads at ingress, but the worker
 * must not TRUST that: an oversized or absurdly deep payload would otherwise
 * inflate the pretty-printed prompt block (indentation grows with depth, so
 * expansion is quadratic) far past any model context.
 */
export const MAX_ROUTINE_EVENTS = 32;
export const MAX_EVENT_FIELD_CHARS = 256;
export const MAX_EVENT_PAYLOAD_CHARS = 65_536;
export const MAX_EVENT_PAYLOAD_DEPTH = 32;

export function assertRoutineEventBounds(
  events: Array<{ id: string; trigger_slug: string; payload: unknown }>,
): void {
  if (events.length > MAX_ROUTINE_EVENTS) {
    throw new Error(
      `'routine.events' exceeds ${MAX_ROUTINE_EVENTS} entries (${events.length})`,
    );
  }
  for (const event of events) {
    if (
      event.id.length > MAX_EVENT_FIELD_CHARS ||
      event.trigger_slug.length > MAX_EVENT_FIELD_CHARS
    ) {
      throw new Error("'routine.events' id or trigger_slug too long");
    }
    const serialized = JSON.stringify(event.payload);
    if (
      serialized !== undefined &&
      serialized.length > MAX_EVENT_PAYLOAD_CHARS
    ) {
      throw new Error(
        `'routine.events' payload exceeds ${MAX_EVENT_PAYLOAD_CHARS} serialized chars`,
      );
    }
    if (!withinDepth(event.payload, MAX_EVENT_PAYLOAD_DEPTH)) {
      throw new Error(
        `'routine.events' payload nests deeper than ${MAX_EVENT_PAYLOAD_DEPTH} levels`,
      );
    }
  }
}

function withinDepth(value: unknown, budget: number): boolean {
  if (value === null || typeof value !== "object") return true;
  if (budget === 0) return false;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.every((child) => withinDepth(child, budget - 1));
}
