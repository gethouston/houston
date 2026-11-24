import {
  SEAT_INTERVAL_REFUSALS,
  type SeatIntervalRefusal,
} from "@houston/wire-types";
import { refusalCode, refusalStatus } from "../refusal-code";

/**
 * The interval refusal behind a failed seat checkout or paid create, or null
 * for every other error. A code is recognized only with the status the
 * contract pairs it with. Both are expected states (yearly turned off since
 * the prices were read, or an interval this gateway does not know), answered
 * as outcomes rather than reported as failures.
 */
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
