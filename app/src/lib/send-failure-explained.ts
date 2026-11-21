import { isUploadInterruptedError } from "@houston/sdk/files/upload-interrupted";

export function sendFailureAlreadyExplained(err: unknown): boolean {
  return isUploadInterruptedError(err);
}
