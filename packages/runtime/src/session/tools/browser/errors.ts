import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { BrowserHandoffFailure } from "@houston/wire-types";

export type BrowserErrorCode =
  | "browser_unavailable"
  | "invalid_action"
  | "url_refused"
  | "page_error"
  | "stale_ref"
  | "dialog_open"
  | "page_unresponsive"
  | BrowserHandoffFailure;

export class BrowserToolError extends Error {
  constructor(
    readonly code: BrowserErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserToolError";
  }
}

export interface BrowserFailureDetails {
  ok: false;
  error: { code: BrowserErrorCode; message: string };
}

export interface BrowserSuccessDetails {
  ok: true;
  action: string;
  url?: string;
}

export type BrowserDetails = BrowserSuccessDetails | BrowserFailureDetails;

export function browserFailure(
  code: BrowserErrorCode,
  message: string,
): AgentToolResult<BrowserFailureDetails> {
  return {
    content: [{ type: "text", text: `ERROR ${code}: ${message}` }],
    details: { ok: false, error: { code, message } },
  };
}
