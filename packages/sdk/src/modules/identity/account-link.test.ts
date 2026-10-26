import { describe, expect, it } from "vitest";
import { LINK_TTL_MS } from "./index";
import { GATEWAY, GOOD_CODE, identityKit } from "./test-kit";

describe("account-exists link", () => {
  it("mails the provider's address, then links onto the session the code minted", async () => {
    const kit = identityKit();
    const pending = kit.pending("microsoft.com", " Person@Example.com ");
    await kit.identity.beginAccountLink(pending);
    expect(kit.requests).toEqual([
      {
        url: `${GATEWAY}/v1/auth/email-otp/start`,
        body: { email: "person@example.com" },
      },
    ]);
    expect(kit.identity.getAccountLink()).toEqual({
      status: "needs_code",
      provider: "microsoft.com",
      email: "person@example.com",
      codeError: null,
    });

    expect(await kit.identity.verifyAccountLinkCode(` ${GOOD_CODE} `)).toEqual({
      kind: "linked",
    });

    expect(kit.requests[1]).toEqual({
      url: `${GATEWAY}/v1/auth/email-otp/verify`,
      body: { email: "person@example.com", code: GOOD_CODE },
    });
    expect(kit.calls.linked).toEqual([
      { handle: pending.handle, session: kit.calls.minted[0] },
    ]);
    expect(kit.calls.linked[0]?.session).toBe(kit.calls.minted[0]);
    expect(
      kit.calls.established.map((e) => [e.session.label, e.method]),
    ).toEqual([["linked", "microsoft.com"]]);
    expect(kit.calls.discarded).toEqual([pending.handle]);
    expect(kit.identity.getSnapshot("accountLink")).toEqual({
      status: "linked",
      provider: "microsoft.com",
      email: "person@example.com",
    });
  });

  it("keeps a wrong code on the code step and links once the right one arrives", async () => {
    const kit = identityKit();
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode("000000")).toEqual({
      kind: "code_rejected",
      error: "otp_invalid_code",
    });
    expect(kit.identity.getAccountLink()).toMatchObject({
      status: "needs_code",
      codeError: "otp_invalid_code",
    });
    expect(kit.calls.linked).toEqual([]);
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "linked",
    });
  });

  it("maps the gateway's refusals onto the code step", async () => {
    const kit = identityKit();
    kit.answerStart(429);
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(kit.identity.getAccountLink()).toMatchObject({
      status: "needs_code",
      codeError: "otp_rate_limited",
    });
    kit.answerVerify(409, '{"error":"email_changed","code":"email_changed"}');
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "code_rejected",
      error: "otp_email_changed",
    });
    expect(kit.calls.reported).toEqual([]);
  });

  it("asks for the email code instead when the provider named no address", async () => {
    const kit = identityKit();
    const pending = kit.pending("apple.com", null);
    await kit.identity.beginAccountLink(pending);
    expect(kit.requests).toEqual([]);
    expect(kit.calls.discarded).toEqual([pending.handle]);
    expect(kit.identity.getAccountLink()).toEqual({
      status: "refused",
      provider: "apple.com",
      email: null,
      refusal: "link_email_unknown",
    });
  });

  it("restarts the provider sign-in once the held credential is ten minutes old", async () => {
    const kit = identityKit();
    const pending = kit.pending("google.com", "p@example.com");
    await kit.identity.beginAccountLink(pending);
    kit.advance(LINK_TTL_MS + 1);
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_expired",
    });
    expect(kit.requests.map((r) => r.url.split("/").pop())).toEqual(["start"]);
    expect(kit.calls.discarded).toEqual([pending.handle]);
  });

  it("signs out and refuses quietly when the platform no longer holds the credential", async () => {
    const kit = identityKit();
    kit.linkAnswers(() => ({ kind: "expired" }));
    await kit.identity.beginAccountLink(
      kit.pending("apple.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_expired",
    });
    expect(kit.calls.signedOut).toEqual([kit.calls.minted[0]]);
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.reported).toEqual([]);
  });

  it("reports a provider that refuses the held credential, and signs out", async () => {
    const kit = identityKit();
    const rejection = new Error("INVALID_IDP_RESPONSE");
    kit.linkAnswers(() => {
      throw rejection;
    });
    await kit.identity.beginAccountLink(
      kit.pending("microsoft.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_failed",
    });
    expect(kit.calls.reported).toEqual([
      { quiet: null, reason: "link_failed", cause: rejection },
    ]);
    expect(kit.calls.signedOut).toEqual([kit.calls.minted[0]]);
    expect(kit.identity.getAccountLink()).toMatchObject({
      status: "refused",
      refusal: "link_failed",
    });
  });

  it("keeps the person signed in by email when the identity belongs to another account", async () => {
    const kit = identityKit();
    kit.linkAnswers(() => ({ kind: "identity_taken" }));
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_identity_taken",
    });
    expect(
      kit.calls.established.map((e) => [e.session.label, e.method]),
    ).toEqual([["minted", "email"]]);
    expect(kit.calls.signedOut).toEqual([]);
    expect(kit.reports()).toEqual([
      ["link_identity_taken", "link_identity_taken"],
    ]);
  });

  it("cancels back to idle and stops waiting for a code", async () => {
    const kit = identityKit();
    const pending = kit.pending("google.com", "p@example.com");
    await kit.identity.beginAccountLink(pending);
    kit.identity.cancelAccountLink();
    expect(kit.identity.getAccountLink()).toEqual({ status: "idle" });
    expect(kit.calls.discarded).toEqual([pending.handle]);
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "not_waiting",
    });
    expect(kit.requests).toHaveLength(1);
  });

  it("refuses a link whose answer names another account, and signs out", async () => {
    const kit = identityKit();
    kit.linkAnswers((s) => ({
      kind: "linked",
      session: { ...s, uid: "uid-other" },
    }));
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_failed",
    });
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.signedOut).toEqual([kit.calls.minted[0]]);
  });
});

describe("account-exists takeover rules", () => {
  it("never links a victim's pending credential without the victim's code", async () => {
    const kit = identityKit();
    await kit.identity.beginAccountLink(
      kit.pending("microsoft.com", "victim@example.com"),
    );
    for (const guess of ["111111", "222222"])
      expect(await kit.identity.verifyAccountLinkCode(guess)).toEqual({
        kind: "code_rejected",
        error: "otp_invalid_code",
      });
    expect(kit.requests.map((r) => r.body)).toEqual([
      { email: "victim@example.com" },
      { email: "victim@example.com", code: "111111" },
      { email: "victim@example.com", code: "222222" },
    ]);
    expect(kit.calls.minted).toEqual([]);
    expect(kit.calls.linked).toEqual([]);
  });

  it("refuses a code session for another address against a pending victim credential", async () => {
    const kit = identityKit({ sessionEmail: "attacker@example.com" });
    const pending = kit.pending("microsoft.com", "victim@example.com");
    await kit.identity.beginAccountLink(pending);
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_email_mismatch",
    });
    expect(kit.calls.linked).toEqual([]);
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.signedOut).toEqual([kit.calls.minted[0]]);
    expect(kit.calls.discarded).toEqual([pending.handle]);
    expect(kit.reports()).toEqual([["error", "link_email_mismatch"]]);
  });

  it("never links an Apple relay identity onto a real address", async () => {
    const kit = identityKit({ sessionEmail: "person@example.com" });
    await kit.identity.beginAccountLink(
      kit.pending("apple.com", "x7k2@privaterelay.appleid.com"),
    );
    expect(kit.requests[0]?.body).toEqual({
      email: "x7k2@privaterelay.appleid.com",
    });
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_email_mismatch",
    });
    expect(kit.calls.linked).toEqual([]);
  });

  it("does not fold dots or plus tags when matching addresses", async () => {
    const kit = identityKit({ sessionEmail: "first.last@gmail.com" });
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "firstlast+x@gmail.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_email_mismatch",
    });
  });

  it("keeps the credential out of every snapshot", async () => {
    const kit = identityKit();
    const snapshots: unknown[] = [];
    kit.identity.subscribe("accountLink", (s) => snapshots.push(s));
    const pending = kit.pending("google.com", "p@example.com");
    await kit.identity.beginAccountLink(pending);
    await kit.identity.verifyAccountLinkCode(GOOD_CODE);
    expect(snapshots.map((s) => (s as { status: string }).status)).toEqual([
      "sending_code",
      "needs_code",
      "verifying",
      "linking",
      "linked",
    ]);
    const serialized = JSON.stringify(snapshots);
    expect(serialized.includes(pending.handle)).toBe(false);
    expect(serialized.includes("custom-token")).toBe(false);
    expect(serialized.includes(kit.calls.minted[0]?.idToken ?? "missing")).toBe(
      false,
    );
  });
});

describe("email-code sign-in", () => {
  it("trades a code for the gateway's custom token", async () => {
    const kit = identityKit();
    await kit.identity.sendEmailCode("p@example.com");
    expect(await kit.identity.verifyEmailCode("p@example.com", GOOD_CODE)).toBe(
      "custom-token:p@example.com",
    );
  });

  it("throws the typed refusal for a wrong code", async () => {
    const kit = identityKit();
    await expect(
      kit.identity.verifyEmailCode("p@example.com", "000000"),
    ).rejects.toMatchObject({
      name: "EmailOtpError",
      code: "otp_invalid_code",
      status: 401,
    });
  });
});
