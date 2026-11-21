import { isRoutineNotFoundBody } from "@houston/wire-types/routine-refusal";
import { refusalStatus } from "../refusal-code";

export function isRoutineGone(error: unknown): boolean {
  if (!(error instanceof Error) || refusalStatus(error) !== 404) return false;
  const { body } = error as { body?: unknown };
  const payload = body === undefined ? error.message : body;
  if (typeof payload !== "string") return isRoutineNotFoundBody(payload);
  try {
    return isRoutineNotFoundBody(JSON.parse(payload));
  } catch {
    return false;
  }
}
