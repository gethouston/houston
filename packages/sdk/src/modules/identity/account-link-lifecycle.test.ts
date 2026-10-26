import { describe, expect, it } from "vitest";
import { EmailOtpError } from "./email-otp";
import { GOOD_CODE, identityKit, type TestSession } from "./test-kit";
import type { LinkAttempt } from "./types";

/** A link answer the test settles after the person signs out. */
type LinkAnswer = (session: TestSession) => LinkAttempt<TestSession>;

function deferredLink() {
  let settle!: (answer: LinkAnswer) => void;
  let started!: () => void;
  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });
  const answer = new Promise<LinkAnswer>((resolve) => {
    settle = resolve;
  });
  return {
    inFlight,
    settle,
    attempt: async (session: TestSession) => {
      started();
      return (await answer)(session);
    },
  };
}

describe("signing out while a link is in flight", () => {
  it("never establishes a link that succeeds after the person left", async () => {
    const kit = identityKit();
    const link = deferredLink();
    kit.linkAnswers(link.attempt);
    await kit.identity.beginAccountLink(
      kit.pending("microsoft.com", "p@example.com"),
    );
    const verifying = kit.identity.verifyAccountLinkCode(GOOD_CODE);
    await link.inFlight;
    expect(kit.identity.getAccountLink().status).toBe("linking");

    kit.identity.abandonAccountLink();
    link.settle((session) => ({
      kind: "linked",
      session: { ...session, label: "linked" },
    }));

    expect(await verifying).toEqual({ kind: "not_waiting" });
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.signedOut).toEqual([]);
    expect(kit.identity.getAccountLink()).toEqual({ status: "idle" });
  });

  it("never signs anyone out when that link fails after the person left", async () => {
    const kit = identityKit();
    const link = deferredLink();
    kit.linkAnswers(link.attempt);
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    const verifying = kit.identity.verifyAccountLinkCode(GOOD_CODE);
    await link.inFlight;

    kit.identity.abandonAccountLink();
    const failure = new Error("link request failed");
    link.settle(() => {
      throw failure;
    });

    expect(await verifying).toEqual({ kind: "not_waiting" });
    expect(kit.calls.signedOut).toEqual([]);
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.reported).toEqual([
      { quiet: null, reason: "link_failed", cause: failure },
    ]);
    expect(kit.identity.getAccountLink()).toEqual({ status: "idle" });
  });

  it("keeps the refusal notice when the flow's own sign-out passes through sign-out", async () => {
    const kit = identityKit({ sessionEmail: "other@example.com" });
    // The web port signs the provisional session out through the app's
    // sign-out, which abandons whatever link is running.
    kit.whenSignedOut(() => kit.identity.abandonAccountLink());
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_email_mismatch",
    });
    expect(kit.calls.signedOut).toHaveLength(1);
    expect(kit.identity.getAccountLink()).toMatchObject({
      status: "refused",
      refusal: "link_email_mismatch",
    });
  });

  it("signs out a session minted after the person left, and never links it", async () => {
    const kit = identityKit();
    const mint = kit.holdMint();
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    const verifying = kit.identity.verifyAccountLinkCode(GOOD_CODE);
    await mint.entered;
    kit.identity.abandonAccountLink();
    mint.release();
    expect(await verifying).toEqual({ kind: "not_waiting" });
    expect(kit.calls.minted).toHaveLength(1);
    expect(kit.calls.signedOut).toEqual(kit.calls.minted);
    expect(kit.calls.linked).toEqual([]);
    expect(kit.calls.established).toEqual([]);
  });

  it("lets the person back out of a code that is still being sent", async () => {
    const kit = identityKit();
    const pending = kit.pending("google.com", "p@example.com");
    const sending = kit.identity.beginAccountLink(pending);
    expect(kit.identity.getAccountLink().status).toBe("sending_code");
    kit.identity.cancelAccountLink();
    await sending;
    expect(kit.identity.getAccountLink()).toEqual({ status: "idle" });
    expect(kit.calls.discarded).toEqual([pending.handle]);
  });
});

describe("reporting a code that did not sign in", () => {
  it("counts an unreachable gateway quietly, on send and on verify", async () => {
    const kit = identityKit();
    kit.answerStart("network");
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(kit.identity.getAccountLink()).toMatchObject({
      status: "needs_code",
      codeError: "network",
    });
    kit.answerVerify("network");
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "code_rejected",
      error: "network",
    });
    expect(kit.reports()).toEqual([
      ["offline", "email_code_failed"],
      ["offline", "email_code_failed"],
    ]);
  });

  it("counts an unreachable Identity Platform quietly too", async () => {
    const kit = identityKit();
    kit.mintFails(new EmailOtpError("network"));
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "code_rejected",
      error: "network",
    });
    expect(kit.reports()).toEqual([["offline", "email_code_failed"]]);
  });

  it("reports an unexpected exchange failure for triage", async () => {
    const kit = identityKit();
    kit.mintFails(new Error("INVALID_CUSTOM_TOKEN"));
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "code_rejected",
      error: "unknown",
    });
    expect(kit.reports()).toEqual([["error", "email_code_failed"]]);
  });

  it("shows a merge in progress as the person's to wait out, unreported", async () => {
    const kit = identityKit();
    await kit.identity.beginAccountLink(
      kit.pending("apple.com", "p@example.com"),
    );
    kit.answerVerify(
      503,
      '{"error":"account_merging","code":"account_merging"}',
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "code_rejected",
      error: "otp_account_merging",
    });
    expect(kit.calls.reported).toEqual([]);
    expect(kit.requests).toHaveLength(2);
  });
});

describe("linking only onto the account that exists", () => {
  it.each([
    ["another existing account", { sessionUid: "uid-b" }, "uid-a"],
    ["an account the code just created", { isNewUser: true }, "uid-a"],
    ["a new account when no owner was named", { isNewUser: true }, null],
  ] as const)("refuses %s, and signs it out", async (_, opts, accountId) => {
    const kit = identityKit(opts);
    const pending = kit.pending("apple.com", "p@example.com", accountId);
    await kit.identity.beginAccountLink(pending);
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "refused",
      refusal: "link_wrong_account",
    });
    expect(kit.calls.linked).toEqual([]);
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.signedOut).toEqual(kit.calls.minted);
    expect(kit.calls.discarded).toEqual([pending.handle]);
    expect(kit.reports()).toEqual([["error", "link_wrong_account"]]);
  });

  it("links an existing account when no owner was named", async () => {
    const kit = identityKit({ sessionUid: "uid-b" });
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com", null),
    );
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "linked",
    });
  });
});
