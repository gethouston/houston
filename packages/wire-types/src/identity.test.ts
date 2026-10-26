import { describe, expect, it } from "vitest";
import { emailOtpRefusalOf } from "./identity";

const refusal = (code: string) => JSON.stringify({ error: code, code });

describe("emailOtpRefusalOf", () => {
  it.each([
    [409, "password_account", "otp_password_account"],
    [409, "unverified_account", "otp_unverified_account"],
    [409, "account_deleting", "otp_account_deleting"],
    [403, "account_disabled", "otp_account_disabled"],
    [503, "account_merging", "otp_account_merging"],
  ])("reads the %i %s refusal by its code", (status, code, expected) => {
    expect(emailOtpRefusalOf(status, refusal(code))).toBe(expected);
  });

  it("reads the merge refusal by its code, whatever else it carries", () => {
    expect(
      emailOtpRefusalOf(
        503,
        '{"error":"account_merging","code":"account_merging","retryable":true}',
      ),
    ).toBe("otp_account_merging");
  });

  it("reads a wrong code and a rate limit by status", () => {
    expect(emailOtpRefusalOf(401, '{"error":"invalid or expired code"}')).toBe(
      "otp_invalid_code",
    );
    expect(emailOtpRefusalOf(429, "")).toBe("otp_rate_limited");
  });

  it("names no refusal for an unknown code, a bare status or a page", () => {
    expect(emailOtpRefusalOf(409, refusal("something_new"))).toBeNull();
    expect(emailOtpRefusalOf(409, "{}")).toBeNull();
    expect(emailOtpRefusalOf(503, "<html>unavailable</html>")).toBeNull();
    expect(emailOtpRefusalOf(409, refusal("toString"))).toBeNull();
  });
});
