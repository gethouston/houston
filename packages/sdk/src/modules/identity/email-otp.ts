import {
  type EmailOtpRefusal,
  type EmailOtpStartBody,
  type EmailOtpVerifyBody,
  emailOtpRefusalOf,
  emailOtpVerifyResponseSchema,
} from "@houston/wire-types";
import type { AccountLinkCodeError } from "./types";

/** Every way an email-code request fails, refusals first. */
export type EmailOtpFailure =
  | EmailOtpRefusal
  | "network"
  | "malformed_response"
  | "unknown";

export class EmailOtpError extends Error {
  constructor(
    readonly code: EmailOtpFailure,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(`email code request failed: ${code}`, options);
    this.name = "EmailOtpError";
  }
}

/** How a failed email-code call reads at the code step: an answer the client
 *  cannot parse is as unexpected as any other failure. */
export function codeErrorOf(error: unknown): AccountLinkCodeError {
  if (!(error instanceof EmailOtpError)) return "unknown";
  return error.code === "malformed_response" ? "unknown" : error.code;
}

/** The gateway the email-code pair is sent to, and a fetch with no bearer. */
export interface EmailOtpTransport {
  /** Resolved per request: a surface may learn its gateway only once it boots. */
  baseUrl: () => string;
  fetch: typeof fetch;
}

/** POST `body` and answer with the status and the body text. A connection that
 *  fails before the body is read through is `network`, even after the status
 *  arrived. */
async function post(
  transport: EmailOtpTransport,
  path: string,
  body: EmailOtpStartBody | EmailOtpVerifyBody,
): Promise<{ status: number; text: string }> {
  const url = `${transport.baseUrl().replace(/\/+$/, "")}${path}`;
  let res: Response | undefined;
  let text: string;
  try {
    res = await transport.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (error) {
    throw new EmailOtpError("network", res?.status, { cause: error });
  }
  if (res.ok) return { status: res.status, text };
  throw new EmailOtpError(
    emailOtpRefusalOf(res.status, text) ?? "unknown",
    res.status,
  );
}

/** Ask the gateway to mail a 6-digit code to `email`. */
export async function startEmailOtp(
  transport: EmailOtpTransport,
  email: string,
): Promise<void> {
  await post(transport, "/v1/auth/email-otp/start", { email });
}

/** Trade the code for the gateway's Identity Platform custom token. */
export async function verifyEmailOtp(
  transport: EmailOtpTransport,
  email: string,
  code: string,
): Promise<string> {
  const { status, text } = await post(transport, "/v1/auth/email-otp/verify", {
    email,
    code,
  });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new EmailOtpError("malformed_response", status, { cause: error });
  }
  const parsed = emailOtpVerifyResponseSchema.safeParse(body);
  if (!parsed.success) throw new EmailOtpError("malformed_response", status);
  return parsed.data.customToken;
}
