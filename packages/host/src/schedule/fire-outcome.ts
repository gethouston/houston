import {
  isTurnBusy,
  TurnDeliveryUncertainError,
  TurnFireError,
} from "../channel/fire-error";
import { AgentRenamingError, LauncherClosedError } from "../ports";
import type { TurnBus } from "../turn/bus";
import type { FireLock } from "./fire-lock";
import { RoutineBusyError, RoutineRunUnrecordedError } from "./run";
import { isUnconnectedRefusal } from "./run-failure";

export type FireOutcomeLedger = FireLock & Pick<TurnBus, "get" | "set" | "del">;

export type FireOutcome =
  | { result: "fired"; startedAt: string }
  | { result: "busy" }
  | { result: "failed"; code: string | null; error: string };

export const FIRE_IN_FLIGHT = JSON.stringify({ result: "pending" });

export type FireLedgerEntry = FireOutcome | { result: "pending" };

const MAX_ERROR_CHARS = 1000;

export function encodeFireOutcome(outcome: FireOutcome): string {
  if (outcome.result !== "failed") return JSON.stringify(outcome);
  return JSON.stringify({
    ...outcome,
    error: outcome.error.slice(0, MAX_ERROR_CHARS),
  });
}

export function decodeFireOutcome(
  value: string | null,
): FireLedgerEntry | null {
  if (!value || value === "1") return null;
  try {
    const parsed = JSON.parse(value) as Partial<FireLedgerEntry> | null;
    if (parsed?.result === "pending") return { result: "pending" };
    if (parsed?.result === "fired" && typeof parsed.startedAt === "string")
      return { result: "fired", startedAt: parsed.startedAt };
    if (parsed?.result === "busy") return { result: "busy" };
    if (parsed?.result === "failed" && typeof parsed.error === "string")
      return {
        result: "failed",
        code: typeof parsed.code === "string" ? parsed.code : null,
        error: parsed.error,
      };
  } catch {}
  return null;
}

export function isRetryableFireError(err: unknown): boolean {
  return (
    err instanceof LauncherClosedError ||
    err instanceof AgentRenamingError ||
    err instanceof RoutineRunUnrecordedError ||
    (err instanceof TurnDeliveryUncertainError && err.hostShuttingDown) ||
    (err instanceof TurnFireError && err.status === 503) ||
    (err instanceof TypeError && err.message === "fetch failed")
  );
}

export function unfiredOutcome(
  error: unknown,
): Exclude<FireOutcome, { result: "fired" }> {
  if (error instanceof RoutineBusyError || isTurnBusy(error))
    return { result: "busy" };
  return {
    result: "failed",
    code: error instanceof TurnFireError ? error.code : null,
    error: error instanceof Error ? error.message : String(error),
  };
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function reportUnfiredFire(
  routineId: string,
  error: unknown,
  deferred: boolean,
): void {
  const tag = `[routine-fires] routine ${routineId}`;
  if (deferred) {
    if (error instanceof RoutineRunUnrecordedError)
      console.error(`${tag} fire deferred, its run unrecorded:`, error);
    else console.warn(`${tag} fire deferred: ${messageOf(error)}`);
    return;
  }
  const outcome = unfiredOutcome(error);
  if (outcome.result === "busy") {
    console.warn(`${tag} skipped: ${messageOf(error)}`);
    return;
  }
  const failed = `${tag} fire failed (${outcome.code ?? "uncoded"})`;
  if (isUnconnectedRefusal(error)) console.warn(`${failed}: ${outcome.error}`);
  else console.error(`${failed}:`, error);
}
