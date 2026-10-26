import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { PendingLinkHandle } from "@houston/sdk/identity";
import {
  desktopLinkPending,
  discardDesktopCredential,
  holdNeedConfirmation,
} from "../src/lib/identity/desktop-link.ts";
import { IdentityError } from "../src/lib/identity/errors.ts";
import type { Session } from "../src/lib/identity/session.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const jwt = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;

const EMAIL_SESSION: Session = {
  idToken: "email-session-id-token",
  refreshToken: "r",
  uid: "uid-a",
  email: "p@example.com",
  emailVerified: true,
  displayName: null,
  photoUrl: null,
  provider: "custom",
  expiresAt: 0,
};

function answer(
  body: unknown,
  status = 200,
): { sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json(body, { status });
  }) as typeof fetch;
  return { sent };
}

const LINKED = {
  idToken: "linked-id-token",
  refreshToken: "linked-refresh",
  expiresIn: "3600",
  localId: "uid-a",
  email: "p@example.com",
};

describe("desktop account-exists credential", () => {
  it("names the address from the provider's own token when GCIP withholds it", () => {
    const pending = holdNeedConfirmation({
      providerId: "microsoft.com",
      email: null,
      localId: "uid-a",
      oauthIdToken: jwt({ sub: "m-1", email: "p@example.com" }),
      oauthAccessToken: null,
      pendingToken: null,
    });
    deepStrictEqual(
      {
        kind: pending.kind,
        provider: pending.provider,
        email: pending.email,
        accountId: pending.accountId,
      },
      {
        kind: "link_required",
        provider: "microsoft.com",
        email: "p@example.com",
        accountId: "uid-a",
      },
    );
  });

  it("links with GCIP's pending token alone when it sent one", async () => {
    const pending = holdNeedConfirmation(
      {
        providerId: "google.com",
        email: "p@example.com",
        localId: "uid-a",
        oauthIdToken: "g",
        oauthAccessToken: "g-access",
        pendingToken: "pending-1",
      },
      jwt({ sub: "g-1", email: "p@example.com" }),
    );
    const { sent } = answer({ ...LINKED, providerId: "google.com" });
    const attempt = await desktopLinkPending(pending.handle, EMAIL_SESSION);
    strictEqual(attempt.kind, "linked");
    if (attempt.kind === "linked") {
      strictEqual(attempt.session.uid, "uid-a");
      strictEqual(attempt.session.provider, "google.com");
      strictEqual(attempt.session.idToken, "linked-id-token");
    }
    deepStrictEqual(sent, [
      {
        idToken: "email-session-id-token",
        pendingToken: "pending-1",
        requestUri: "http://localhost",
        returnSecureToken: true,
        returnIdpCredential: true,
      },
    ]);
  });

  it("replays the Google token itself when GCIP sent no pending token", async () => {
    const googleIdToken = jwt({ sub: "g-1", email: "p@example.com" });
    const pending = holdNeedConfirmation(
      {
        providerId: "google.com",
        email: "p@example.com",
        localId: "uid-a",
        oauthIdToken: null,
        oauthAccessToken: null,
        pendingToken: null,
      },
      googleIdToken,
    );
    const { sent } = answer({ ...LINKED, providerId: "google.com" });
    strictEqual(
      (await desktopLinkPending(pending.handle, EMAIL_SESSION)).kind,
      "linked",
    );
    deepStrictEqual(sent, [
      {
        idToken: "email-session-id-token",
        postBody: `providerId=google.com&id_token=${googleIdToken}`,
        requestUri: "http://localhost",
        returnSecureToken: true,
        returnIdpCredential: true,
      },
    ]);
  });

  it("throws a provider's refusal of the held credential, so it is reported", async () => {
    const pending = holdNeedConfirmation({
      providerId: "microsoft.com",
      email: "p@example.com",
      localId: "uid-a",
      oauthIdToken: null,
      oauthAccessToken: null,
      pendingToken: "pending-1",
    });
    answer({ error: { code: 400, message: "INVALID_IDP_RESPONSE" } }, 400);
    await rejects(
      desktopLinkPending(pending.handle, EMAIL_SESSION),
      (e: unknown) =>
        e instanceof IdentityError && e.code === "invalid_idp_response",
    );
  });

  it("reports an identity that already belongs to an account", async () => {
    const pending = holdNeedConfirmation({
      providerId: "apple.com",
      email: "p@example.com",
      localId: "uid-a",
      oauthIdToken: "apple-id-token",
      oauthAccessToken: null,
      pendingToken: null,
    });
    answer({ errorMessage: "FEDERATED_USER_ID_ALREADY_LINKED" });
    deepStrictEqual(await desktopLinkPending(pending.handle, EMAIL_SESSION), {
      kind: "identity_taken",
    });
  });

  it("treats a discarded or unknown handle as expired, without a request", async () => {
    const pending = holdNeedConfirmation({
      providerId: "google.com",
      email: "p@example.com",
      localId: "uid-a",
      oauthIdToken: "g",
      oauthAccessToken: null,
      pendingToken: null,
    });
    discardDesktopCredential(pending.handle);
    const { sent } = answer({});
    deepStrictEqual(await desktopLinkPending(pending.handle, EMAIL_SESSION), {
      kind: "expired",
    });
    deepStrictEqual(
      await desktopLinkPending("nope" as PendingLinkHandle, EMAIL_SESSION),
      { kind: "expired" },
    );
    deepStrictEqual(sent, []);
  });
});
