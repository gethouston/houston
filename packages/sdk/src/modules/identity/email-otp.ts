import {
  type EmailOtpRefusal,
  type EmailOtpStartBody,
  type EmailOtpVerifyBody,
  emailOtpRefusalOf,
  emailOtpVerifyResponseSchema,
} from "@houston/wire-types";

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

/** The gateway the email-code pair is sent to, and a fetch with no bearer. */
export interface EmailOtpTransport {
  /** Resolved per request: a surface may learn its gateway only once it boots. */
  baseUrl: () => string;
  fetch: typeof fetch;
}

async function post(
  transport: EmailOtpTransport,
  path: string,
  body: EmailOtpStartBody | EmailOtpVerifyBody,
): Promise<Response> {
  const url = `${transport.baseUrl().replace(/\/+$/, "")}${path}`;
  let res: Response;
  try {
    res = await transport.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new EmailOtpError("network", undefined, { cause: error });
  }
  if (res.ok) return res;
  throw new EmailOtpError(
    emailOtpRefusalOf(res.status) ?? "unknown",
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
  const res = await post(transport, "/v1/auth/email-otp/verify", {
    email,
    code,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch (error) {
    throw new EmailOtpError("malformed_response", res.status, {
      cause: error,
    });
  }
  const parsed = emailOtpVerifyResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new EmailOtpError("malformed_response", res.status);
  return parsed.data.customToken;
}
