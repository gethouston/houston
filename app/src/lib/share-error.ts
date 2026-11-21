import { classifyMoveRePost, isMoveRefusalCode } from "@houston/sdk";
import { engineErrorCode } from "./engine-error-code.ts";

export function shareErrorCode(err: unknown): string | undefined {
  const code = engineErrorCode(err);
  if (code !== undefined) return code;
  const bodyError = (err as { body?: { error?: unknown } } | null | undefined)
    ?.body?.error;
  return typeof bodyError === "string" ? bodyError : undefined;
}

export function isExpectedShareError(err: unknown): boolean {
  const code = shareErrorCode(err);
  return isMoveRefusalCode(code) || code === "already_member";
}

export function isExpectedMoveAnswer(err: unknown): boolean {
  return (
    isExpectedShareError(err) ||
    classifyMoveRePost(shareErrorCode(err)).kind !== "rejected"
  );
}
