import { isConversationEditRefusalCode } from "@houston/wire-types/conversation-refusal";
import { refusalCode } from "./refusal-code";

export function isComputeBusyRefusal(error: unknown): boolean {
  return error instanceof Error && refusalCode(error) === "compute_busy";
}

export function isPodWakeRefused(error: unknown): boolean {
  return error instanceof Error && refusalCode(error) === "pod_wake_refused";
}

export function isConversationEditRefused(error: unknown): boolean {
  return (
    error instanceof Error && isConversationEditRefusalCode(refusalCode(error))
  );
}
