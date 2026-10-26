import type { LinkProvider } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { createIdentityModule, LINK_TTL_MS } from "./index";
import {
  type AccountLinkProblem,
  type IdentitySession,
  type LinkAttempt,
  newPendingLinkHandle,
  type PendingLink,
  type PendingLinkHandle,
} from "./types";

const GATEWAY = "https://gw.test";
const GOOD_CODE = "123456";

/** An unsigned JWT whose payload carries `claims`. */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${part({ alg: "none" })}.${part(claims)}.`;
}

interface TestSession extends IdentitySession {
  label: string;
}

/**
 * A gateway that mails codes and mints a custom token naming the address the
 * code was verified for, plus a platform port that records every call. The
 * session a custom token signs in to names `sessionEmail` (the gateway's
 * account for that address), so a test can model a server that resolves an
 * address to a different account.
 */
function identityKit(opts: { sessionEmail?: string } = {}) {
  const requests: { url: string; body: unknown }[] = [];
  let clock = 1_000_000;
  let startStatus = 204;
  let verifyStatus: number | null = null;
  let attempt: (session: TestSession) => LinkAttempt<TestSession> = (s) => ({
    kind: "linked",
    session: { ...s, idToken: `${s.idToken}+linked`, label: "linked" },
  });
  const calls = {
    minted: [] as TestSession[],
    linked: [] as { handle: PendingLinkHandle; session: TestSession }[],
    discarded: [] as PendingLinkHandle[],
    signedOut: [] as TestSession[],
    established: [] as {
      session: TestSession;
      method: LinkProvider | "email";
    }[],
    reported: [] as AccountLinkProblem[],
  };

  const fetch = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    requests.push({ url: String(url), body });
    if (String(url).endsWith("/start"))
      return new Response(null, { status: startStatus });
    if (verifyStatus) return new Response("", { status: verifyStatus });
    if (body.code !== GOOD_CODE) return new Response("", { status: 401 });
    return Response.json({ customToken: `custom-token:${body.email}` });
  }) as typeof globalThis.fetch;

  const identity = createIdentityModule<TestSession>({
    baseUrl: () => `${GATEWAY}/`,
    fetch,
    now: () => clock,
    port: {
      async signInWithCustomToken(customToken) {
        const address = opts.sessionEmail ?? customToken.split(":")[1];
        const session = {
          uid: "uid-a",
          idToken: jwt({ email: address }),
          label: "minted",
        };
        calls.minted.push(session);
        return session;
      },
      async linkPending(handle, session) {
        calls.linked.push({ handle, session });
        return attempt(session);
      },
      discardPending: (handle) => calls.discarded.push(handle),
      async signOutProvisional(session) {
        calls.signedOut.push(session);
      },
      async establish(session, method) {
        calls.established.push({ session, method });
      },
      report: (problem) => calls.reported.push(problem),
    },
  });

  return {
    identity,
    requests,
    calls,
    pending(provider: LinkProvider, email: string | null): PendingLink {
      return {
        kind: "link_required",
        provider,
        email,
        handle: newPendingLinkHandle(),
      };
    },
    advance: (ms: number) => {
      clock += ms;
    },
    answerStart: (status: number) => {
      startStatus = status;
    },
    answerVerify: (status: number) => {
      verifyStatus = status;
    },
    linkAnswers: (next: typeof attempt) => {
      attempt = next;
    },
  };
}

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
    kit.answerVerify(409);
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "code_rejected",
      error: "otp_password_account",
    });
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

  it("signs out and refuses when the provider no longer accepts the held credential", async () => {
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
    expect(kit.calls.reported.map((r) => [r.severity, r.reason])).toEqual([
      ["quiet", "link_identity_taken"],
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
    expect(kit.calls.reported.map((r) => [r.severity, r.reason])).toEqual([
      ["error", "link_email_mismatch"],
    ]);
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
