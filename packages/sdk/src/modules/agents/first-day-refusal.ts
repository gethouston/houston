import type { FirstDayRefusal } from "@houston/protocol";
import {
  parseFirstDayRefusal,
  parseFirstDayRefusalText,
} from "@houston/wire-types/first-day-refusal";

export function firstDayRefusal(error: unknown): FirstDayRefusal | null {
  if (!error || typeof error !== "object") return null;
  const { status, body, message } = error as {
    status?: unknown;
    body?: unknown;
    message?: unknown;
  };
  if (status !== 409) return null;
  const payload = body === undefined ? message : body;
  return typeof payload === "string"
    ? parseFirstDayRefusalText(payload)
    : parseFirstDayRefusal(payload);
}

export function isFirstDayNoProvider(error: unknown): boolean {
  return firstDayRefusal(error)?.code === "first_day_no_provider";
}

export function isFirstDayNotPending(error: unknown): boolean {
  return firstDayRefusal(error)?.code === "first_day_not_pending";
}
