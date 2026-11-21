import { shareErrorCode } from "./share-error.ts";

export const MODEL_NOT_ALLOWED_CODE = "model_not_allowed";

export function isModelNotAllowedError(err: unknown): boolean {
  return shareErrorCode(err) === MODEL_NOT_ALLOWED_CODE;
}
