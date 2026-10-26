import { createIdentityClient } from "@houston/engine-adapter";
import type { AccountLinkPort, IdentitySession } from "@houston/sdk";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createWireCapture, json } from "./support/wire-capture";

const GATEWAY = "https://gw.example";
const { calls, reset, restore, stubFetch, stubRouted } = createWireCapture();

beforeEach(reset);
afterEach(restore);

const unused = (): never => {
  throw new Error("the email-code pair never reaches the platform port");
};
const port: AccountLinkPort<IdentitySession> = {
  signInWithCustomToken: unused,
  linkPending: unused,
  discardPending: unused,
  signOutProvisional: unused,
  establish: unused,
  report: unused,
};

const identity = () =>
  createIdentityClient({ gatewayUrl: () => `${GATEWAY}/`, port });

function expectPreAuthHeaders(): void {
  for (const call of calls) {
    expect([...call.headers.entries()]).toEqual([
      ["content-type", "application/json"],
    ]);
  }
}

describe("email-code wire (pre-auth)", () => {
  test("start posts the address, with no bearer and no space", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await identity().sendEmailCode("p@example.com");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${GATEWAY}/v1/auth/email-otp/start`,
      body: '{"email":"p@example.com"}',
    });
    expectPreAuthHeaders();
  });

  test("verify posts the address and code and returns the custom token", async () => {
    stubFetch(() => json(200, { customToken: "ct-1" }));
    expect(await identity().verifyEmailCode("p@example.com", "123456")).toBe(
      "ct-1",
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${GATEWAY}/v1/auth/email-otp/verify`,
      body: '{"email":"p@example.com","code":"123456"}',
    });
    expectPreAuthHeaders();
  });

  test.each([
    [401, "otp_invalid_code"],
    [429, "otp_rate_limited"],
    [409, "unknown"],
    [500, "unknown"],
  ])("verify answering a bare %i throws %s", async (status, code) => {
    stubRouted(() => json(status, {}));
    await expect(
      identity().verifyEmailCode("p@example.com", "123456"),
    ).rejects.toMatchObject({ name: "EmailOtpError", code, status });
  });

  test.each([
    [409, "password_account", "otp_password_account"],
    [409, "email_changed", "otp_email_changed"],
    [409, "unverified_account", "otp_unverified_account"],
    [409, "account_deleting", "otp_account_deleting"],
    [403, "account_disabled", "otp_account_disabled"],
    [503, "account_merging", "otp_account_merging"],
  ])("verify refused %i %s throws %s", async (status, refusal, code) => {
    stubRouted(() => json(status, { error: refusal, code: refusal }));
    await expect(
      identity().verifyEmailCode("p@example.com", "123456"),
    ).rejects.toMatchObject({ name: "EmailOtpError", code, status });
  });

  // fetch resolves once the headers arrive, so a dropped connection can
  // still fail the body read.
  const breaksOffMidBody = (status: number) =>
    new Response(
      new ReadableStream({
        start: (c) => c.error(new TypeError("terminated")),
      }),
      { status },
    );

  test("a refusal whose body breaks off is offline, on both calls", async () => {
    stubRouted(() => breaksOffMidBody(401));
    await expect(
      identity().sendEmailCode("p@example.com"),
    ).rejects.toMatchObject({
      name: "EmailOtpError",
      code: "network",
      status: 401,
    });
    await expect(
      identity().verifyEmailCode("p@example.com", "123456"),
    ).rejects.toMatchObject({
      name: "EmailOtpError",
      code: "network",
      status: 401,
    });
  });

  test("a custom token whose body breaks off is offline, not malformed", async () => {
    stubRouted(() => breaksOffMidBody(200));
    await expect(
      identity().verifyEmailCode("p@example.com", "123456"),
    ).rejects.toMatchObject({
      name: "EmailOtpError",
      code: "network",
      status: 200,
    });
  });

  test("a 200 without a custom token is malformed", async () => {
    stubFetch(() => json(200, { token: "x" }));
    await expect(
      identity().verifyEmailCode("p@example.com", "123456"),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
});
