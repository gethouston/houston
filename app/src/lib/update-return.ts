import { UPDATE_CHECK_INTERVAL_MS } from "./update-policy";
import type { UpdateStatus } from "./update-status";

export const LONG_ABSENCE_MS = 4 * 60 * 60 * 1000;

export const SLEEP_GAP_MS = 10 * 60 * 1000;

export interface AbsenceState {
  awaySince: number | null;
  lastTickAt: number;
}

export function initialAbsence(now: number): AbsenceState {
  return { awaySince: null, lastTickAt: now };
}

export type AbsenceEvent =
  | { kind: "blur"; at: number }
  | { kind: "hidden"; at: number }
  | { kind: "visible"; at: number; focused: boolean }
  | { kind: "focus"; at: number }
  | { kind: "tick"; at: number; focused: boolean };

export function windowInFront(
  doc: Pick<Document, "hasFocus" | "visibilityState">,
): boolean {
  return doc.hasFocus() && doc.visibilityState === "visible";
}

export interface AbsenceStep {
  state: AbsenceState;
  returned: boolean;
}

export function absenceStep(
  state: AbsenceState,
  event: AbsenceEvent,
): AbsenceStep {
  switch (event.kind) {
    case "blur":
    case "hidden":
      return { state: away(state, event.at), returned: false };
    case "visible":
      return event.focused
        ? comeBack(state, event.at)
        : { state, returned: false };
    case "focus":
      return comeBack(state, event.at);
    case "tick": {
      const gap = event.at - state.lastTickAt - UPDATE_CHECK_INTERVAL_MS;
      if (gap < SLEEP_GAP_MS) {
        const awaySince = event.focused ? null : state.awaySince;
        return { state: { awaySince, lastTickAt: event.at }, returned: false };
      }
      const slept = away(state, state.lastTickAt);
      return event.focused
        ? comeBack(slept, event.at)
        : { state: { ...slept, lastTickAt: event.at }, returned: false };
    }
  }
}

function away(state: AbsenceState, at: number): AbsenceState {
  const awaySince =
    state.awaySince === null ? at : Math.min(state.awaySince, at);
  return { ...state, awaySince };
}

function comeBack(state: AbsenceState, at: number): AbsenceStep {
  if (state.awaySince === null) return { state, returned: false };
  return {
    state: { awaySince: null, lastTickAt: at },
    returned: at - state.awaySince >= LONG_ABSENCE_MS,
  };
}

export interface ReturnInputs {
  status: UpdateStatus;
  engineRemote: boolean;
  turnInFlight: boolean;
  draftPending: boolean;
}

export type ReturnHoldReason = "turn" | "draft" | "busy";

export type ReturnHold = () => ReturnHoldReason | null;

export type ReturnAction =
  | { kind: "install" }
  | { kind: "hold"; reason: ReturnHoldReason }
  | { kind: "check" };

export function returnAction(inputs: ReturnInputs): ReturnAction {
  const { status, engineRemote } = inputs;
  if (!engineRemote) return { kind: "check" };
  if (status.state === "downloading" || status.state === "installing") {
    return { kind: "hold", reason: "busy" };
  }
  if (status.state !== "downloaded") return { kind: "check" };
  const reason = returnLossHold(inputs);
  return reason === null ? { kind: "install" } : { kind: "hold", reason };
}

export function returnLossHold({
  turnInFlight,
  draftPending,
}: Pick<ReturnInputs, "turnInFlight" | "draftPending">): Exclude<
  ReturnHoldReason,
  "busy"
> | null {
  if (turnInFlight) return "turn";
  if (draftPending) return "draft";
  return null;
}

export function draftPending(
  drafts: Record<string, { text: string; files: readonly unknown[] }>,
  parked: Record<string, unknown>,
): boolean {
  if (Object.keys(parked).length > 0) return true;
  return Object.values(drafts).some(
    (draft) => draft.text.trim() !== "" || draft.files.length > 0,
  );
}
