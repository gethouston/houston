import {
  type EmailOtpRefusal,
  type EmailOtpStartBody,
  type EmailOtpVerifyBody,
  emailOtpRefusalOf,
  emailOtpVerifyResponseSchema,
} from "@houston/wire-types";
import type { AccountLinkCodeError } from "./types";

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

export function codeErrorOf(error: unknown): AccountLinkCodeError {
  if (!(error instanceof EmailOtpError)) return "unknown";
  return error.code === "malformed_response" ? "unknown" : error.code;
}

export interface EmailOtpTransport {
  baseUrl: () => string;
  fetch: typeof fetch;
}

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

export async function startEmailOtp(
  transport: EmailOtpTransport,
  email: string,
): Promise<void> {
  await post(transport, "/v1/auth/email-otp/start", { email });
}

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
