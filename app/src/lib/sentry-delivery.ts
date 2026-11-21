import * as Sentry from "@sentry/browser";
import { resolveCapturedEventId } from "./sentry-transport";

const deliveryAccepted = new Map<string, boolean>();
const MAX_TRACKED_DELIVERIES = 64;

export function recordDelivery(eventId: string, accepted: boolean): void {
  if (deliveryAccepted.size >= MAX_TRACKED_DELIVERIES) {
    const oldest = deliveryAccepted.keys().next().value;
    if (oldest !== undefined) deliveryAccepted.delete(oldest);
  }
  deliveryAccepted.set(eventId, accepted);
}

export async function confirmDelivery(eventId: string): Promise<string> {
  const flushed = await Sentry.flush(5000);
  const accepted = deliveryAccepted.get(eventId) === true;
  deliveryAccepted.delete(eventId);
  return resolveCapturedEventId(eventId, flushed, accepted);
}
