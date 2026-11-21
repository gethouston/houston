import {
  BROWSER_HANDOFF_STATES,
  type BrowserHandoffEnd,
} from "@houston/wire-types";
import type { BrowserLiveConnectionState } from "./types";

type EndReason = Extract<
  BrowserLiveConnectionState,
  { kind: "ended" }
>["reason"];

export type BrowserLiveFailure =
  | { kind: "ended"; reason: EndReason }
  | { kind: "transient" }
  | { kind: "unexpected" };

function statusOf(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function endedStateOf(err: unknown): BrowserHandoffEnd | "none" {
  const body = (err as { body?: unknown }).body;
  if (typeof body !== "string") return "none";
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "none";
  }
  const state = (parsed as { state?: unknown } | null)?.state;
  return state !== "waiting" &&
    BROWSER_HANDOFF_STATES.includes(state as BrowserHandoffEnd)
    ? (state as BrowserHandoffEnd)
    : "none";
}

export class BrowserLiveInputTimeout extends Error {
  constructor() {
    super("browser input POST timed out");
    this.name = "BrowserLiveInputTimeout";
  }
}

export function classifyLiveFailure(
  err: unknown,
  isTransport: (err: unknown) => boolean,
): BrowserLiveFailure {
  if (isTransport(err) || err instanceof BrowserLiveInputTimeout)
    return { kind: "transient" };
  const status = statusOf(err);
  if (status === null) return { kind: "unexpected" };
  if (status === 404) return { kind: "ended", reason: "none" };
  if (status === 403) return { kind: "ended", reason: "not_owner" };
  if (status === 409) return { kind: "ended", reason: endedStateOf(err) };
  if (status === 401 || status === 408 || status === 429 || status >= 500)
    return { kind: "transient" };
  if (status === 0) return { kind: "transient" };
  return { kind: "unexpected" };
}
