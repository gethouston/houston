import { z } from "zod";

/**
 * The gateway's pre-auth email-code pair. The client holds no bearer yet:
 *
 *  - `POST /v1/auth/email-otp/start` `{email}` answers 204 and mails a code.
 *  - `POST /v1/auth/email-otp/verify` `{email, code}` answers 200
 *    `{customToken}`, which signs in to Identity Platform.
 *
 * A refusal answers `{error, code}`. The gateway codes the first two by
 * status alone, the rest by `code`:
 *
 *  - 401 `otp_invalid_code`: the code is wrong or expired.
 *  - 429 `otp_rate_limited`: too many starts or verifies for the address.
 *  - 409 `password_account`: the address belongs to a password account,
 *    which an email code never signs in to.
 *  - 409 `unverified_account`: another sign-in method holds the address
 *    without having proved it.
 *  - 409 `account_deleting`: the account is being deleted.
 *  - 403 `account_disabled`: the account is disabled.
 *  - 503 `account_merging`: the account is being merged into another one.
 *    The code is spent by then, so nothing retries it: the person requests
 *    a new code once the merge finishes.
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
  | "otp_password_account"
  | "otp_unverified_account"
  | "otp_account_deleting"
  | "otp_account_disabled"
  | "otp_account_merging";

const REFUSAL_BY_STATUS: ReadonlyMap<number, EmailOtpRefusal> = new Map([
  [401, "otp_invalid_code"],
  [429, "otp_rate_limited"],
]);

const REFUSAL_BY_CODE: ReadonlyMap<string, EmailOtpRefusal> = new Map([
  ["password_account", "otp_password_account"],
  ["unverified_account", "otp_unverified_account"],
  ["account_deleting", "otp_account_deleting"],
  ["account_disabled", "otp_account_disabled"],
  ["account_merging", "otp_account_merging"],
]);

const refusalBodySchema = z.object({ code: z.string() });

/** The refusal an email-code answer carries, or null when it names none. */
export function emailOtpRefusalOf(
  status: number,
  bodyText: string,
): EmailOtpRefusal | null {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // Not JSON (a proxy's error page): the status alone decides.
  }
  const parsed = refusalBodySchema.safeParse(body);
  return (
    (parsed.success ? REFUSAL_BY_CODE.get(parsed.data.code) : undefined) ??
    REFUSAL_BY_STATUS.get(status) ??
    null
  );
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
 *  - `link_wrong_account`: the email code signed in to another account than
 *    the one the provider sign-in met, or to a brand-new one. Nothing is
 *    linked.
 *  - `link_expired`: the held provider sign-in is too old, or the platform no
 *    longer holds it. The person signs in with the provider again.
 *  - `link_identity_taken`: the provider identity already belongs to an
 *    account. The person stays signed in to the account the code proved.
 *  - `link_failed`: an unexpected failure after the code was accepted.
 */
export type AccountLinkRefusal =
  | "link_email_unknown"
  | "link_email_mismatch"
  | "link_wrong_account"
  | "link_expired"
  | "link_identity_taken"
  | "link_failed";
