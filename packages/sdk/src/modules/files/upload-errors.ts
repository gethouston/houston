import {
  parseUploadRefusal,
  type UploadRefusalCode,
} from "@houston/wire-types";
import { SdkHttpError } from "../http";

export class UploadSessionsUnavailableError extends SdkHttpError {
  constructor() {
    super(
      "Upload sessions are unavailable on this host",
      404,
      "UploadSessionsUnavailableError",
    );
  }
}

export class UploadRefusalError extends SdkHttpError {
  readonly body: string;
  constructor(
    message: string,
    status: number,
    readonly code: UploadRefusalCode,
  ) {
    super(message, status, "UploadRefusalError");
    this.body = JSON.stringify({ error: message, code });
  }
}

export class UploadTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadTransferError";
  }
}

export function uploadRefusal(error: unknown): unknown {
  if (!(error instanceof SdkHttpError)) return error;
  let body: unknown;
  try {
    body = JSON.parse(error.message);
  } catch {
    return error;
  }
  const refusal = parseUploadRefusal(body);
  if (!refusal) return error;
  const typed = new UploadRefusalError(
    refusal.error,
    error.status,
    refusal.code,
  );
  typed.retryAfterMs = error.retryAfterMs;
  return typed;
}
