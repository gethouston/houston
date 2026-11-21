import {
  SEAT_INTERVAL_REFUSALS,
  type SeatIntervalRefusal,
} from "@houston/wire-types";
import { refusalCode, refusalStatus } from "../refusal-code";

export function seatIntervalRefusal(
  error: unknown,
): SeatIntervalRefusal | null {
  if (!(error instanceof Error)) return null;
  const code = refusalCode(error);
  if (code === null || !Object.hasOwn(SEAT_INTERVAL_REFUSALS, code))
    return null;
  const refusal = code as SeatIntervalRefusal;
  return SEAT_INTERVAL_REFUSALS[refusal] === refusalStatus(error)
    ? refusal
    : null;
}
