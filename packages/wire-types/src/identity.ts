import { z } from "zod";

/**
 * The gateway's pre-auth email-code pair. The client holds no bearer yet:
 *
 *  - `POST /v1/auth/email-otp/start` `{email}` answers 204 and mails a code.
 *  - `POST /v1/auth/email-otp/verify` `{email, code}` answers 200
 *    `{customToken}`, which signs in to Identity Platform.
 *
 * The gateway codes its refusals by status alone:
 *
 *  - 401 `otp_invalid_code`: the code is wrong or expired.
 *  - 429 `otp_rate_limited`: too many starts or verifies for the address.
 *  - 409 `otp_password_account`: the address belongs to a password account,
 *    which an email code never signs in to.
 */
export interface EmailOtpStartBody {
  email: string;
}

export interface EmailOtpVerifyBody {
  email: string;
  code: string;
}

export const emailOtpVerifyResponseSchema = z.object({
  customToken: z.string().min(1),
});

export type EmailOtpVerifyResponse = z.infer<
  typeof emailOtpVerifyResponseSchema
>;

export type EmailOtpRefusal =
  | "otp_invalid_code"
  | "otp_rate_limited"
  | "otp_password_account";

const REFUSAL_BY_STATUS: Readonly<Partial<Record<number, EmailOtpRefusal>>> = {
  401: "otp_invalid_code",
  409: "otp_password_account",
  429: "otp_rate_limited",
};

/** The refusal an email-code status carries, or null for any other status. */
export function emailOtpRefusalOf(status: number): EmailOtpRefusal | null {
  return REFUSAL_BY_STATUS[status] ?? null;
}

export const LINK_PROVIDERS = [
  "google.com",
  "microsoft.com",
  "apple.com",
] as const;

export type LinkProvider = (typeof LINK_PROVIDERS)[number];

/**
 * A Google, Microsoft or Apple sign-in that met an existing Houston account.
 * Identity Platform holds the provider back until the person proves the inbox
 * with an email code, so this carries only what the person sees. The provider
 * credential stays with the platform that received it.
 */
export interface LinkRequired {
  kind: "link_required";
  provider: LinkProvider;
  /** The provider-asserted address; null when neither Identity Platform nor
   *  the provider's own token named one. */
  email: string | null;
}

/**
 * Why adding a provider to an existing account stopped:
 *
 *  - `link_email_unknown`: no provider-asserted address, so there is no inbox
 *    to prove. The person signs in with an email code instead.
 *  - `link_email_mismatch`: the email-code session names a different address
 *    than the provider did. Nothing is linked.
 *  - `link_expired`: the held provider sign-in is too old, or the provider no
 *    longer accepts it. The person signs in with the provider again.
 *  - `link_identity_taken`: the provider identity already belongs to an
 *    account. The person stays signed in to the account the code proved.
 *  - `link_failed`: an unexpected failure after the code was accepted.
 */
export type AccountLinkRefusal =
  | "link_email_unknown"
  | "link_email_mismatch"
  | "link_expired"
  | "link_identity_taken"
  | "link_failed";
