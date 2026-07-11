// Client for Houston's gateway email-OTP endpoints. GCIP has no built-in
// 6-digit email OTP, so the gateway owns it: it emails the code, verifies it,
// and returns a GCIP CUSTOM TOKEN that the client exchanges via
// `signInWithCustomToken` (firebase-rest.ts) for a normal Firebase session.
//
// ── CONTRACT (source of truth; built server-side in cloud/ in parallel) ──
//   POST {gateway}/v1/auth/email-otp/start   { email }         → 204 No Content
//   POST {gateway}/v1/auth/email-otp/verify  { email, code }   → 200 { customToken }
//     · 401 → wrong / expired code   (IdentityError "otp_invalid_code")
//     · 429 → rate limited           (IdentityError "otp_rate_limited")
//   The gateway base URL is supplied by the caller (Wave 2 reads it from the
//   engine config — window.__HOUSTON_ENGINE__.baseUrl / VITE_HOSTED_ENGINE_URL).
// ─────────────────────────────────────────────────────────────────────────

import { IdentityError } from "./errors.ts";

export interface VerifyOtpResult {
  /** GCIP custom token — feed to firebase-rest.signInWithCustomToken. */
  customToken: string;
}

function otpError(status: number): IdentityError {
  if (status === 401)
    return new IdentityError("otp_invalid_code", { httpStatus: status });
  if (status === 429)
    return new IdentityError("otp_rate_limited", { httpStatus: status });
  return new IdentityError("unknown", { httpStatus: status });
}

function joinUrl(gatewayUrl: string, path: string): string {
  return `${gatewayUrl.replace(/\/+$/, "")}${path}`;
}

/** Request a 6-digit code be emailed to `email`. Resolves on 204. */
export async function startEmailOtp(
  gatewayUrl: string,
  email: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(joinUrl(gatewayUrl, "/v1/auth/email-otp/start"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch (e) {
    throw new IdentityError("network", { cause: e });
  }
  if (!res.ok) throw otpError(res.status);
}

/** Verify the code; return the gateway-minted custom token. */
export async function verifyEmailOtp(
  gatewayUrl: string,
  email: string,
  code: string,
): Promise<VerifyOtpResult> {
  let res: Response;
  try {
    res = await fetch(joinUrl(gatewayUrl, "/v1/auth/email-otp/verify"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
  } catch (e) {
    throw new IdentityError("network", { cause: e });
  }
  if (!res.ok) throw otpError(res.status);
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch (e) {
    throw new IdentityError("malformed_response", {
      httpStatus: res.status,
      cause: e,
    });
  }
  const customToken =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).customToken
      : undefined;
  if (typeof customToken !== "string" || customToken.length === 0) {
    throw new IdentityError("malformed_response", { httpStatus: res.status });
  }
  return { customToken };
}
