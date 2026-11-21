import { z } from "zod";

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
  | "otp_email_changed"
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
  ["email_changed", "otp_email_changed"],
  ["unverified_account", "otp_unverified_account"],
  ["account_deleting", "otp_account_deleting"],
  ["account_disabled", "otp_account_disabled"],
  ["account_merging", "otp_account_merging"],
]);

const refusalBodySchema = z.object({ code: z.string() });

export function emailOtpRefusalOf(
  status: number,
  bodyText: string,
): EmailOtpRefusal | null {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {}
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

export interface LinkRequired {
  kind: "link_required";
  provider: LinkProvider;
  email: string | null;
}

export type AccountLinkRefusal =
  | "link_email_unknown"
  | "link_email_mismatch"
  | "link_wrong_account"
  | "link_expired"
  | "link_identity_taken"
  | "link_failed";
