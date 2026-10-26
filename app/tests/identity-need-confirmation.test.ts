import { deepStrictEqual, rejects } from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { IdentityError } from "../src/lib/identity/errors.ts";
import {
  signInWithIdp,
  signInWithIdpSession,
} from "../src/lib/identity/firebase-idp.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

// The Auth emulator's answer when an account with this verified email already
// exists and the IdP's own email is unverified (/tmp/hou123-link-spike/run2.log).
const NEED_CONFIRMATION = {
  kind: "identitytoolkit#VerifyAssertionResponse",
  context: "",
  providerId: "microsoft.com",
  email: "p@example.com",
  emailVerified: false,
  federatedId: "m-1",
  oauthAccessToken: "ms-access",
  oauthIdToken: "ms-id-token",
  needConfirmation: true,
  localId: "uid-a",
};

describe("GCIP needConfirmation on desktop sign-in", () => {
  it("returns the collision for a direct id_token sign-in", async () => {
    answer(200, NEED_CONFIRMATION);
    const exchange = await signInWithIdp({
      apiKey: "k",
      providerId: "microsoft.com",
      idToken: "ms-id-token",
    });
    deepStrictEqual(exchange, {
      kind: "need_confirmation",
      confirmation: {
        providerId: "microsoft.com",
        email: "p@example.com",
        oauthIdToken: "ms-id-token",
        oauthAccessToken: "ms-access",
        pendingToken: null,
      },
    });
  });

  it("returns the collision for a brokered sign-in, keeping a pendingToken", async () => {
    const { email: _hidden, ...enumerationProtected } = NEED_CONFIRMATION;
    answer(200, { ...enumerationProtected, pendingToken: "pending-1" });
    const exchange = await signInWithIdpSession({
      apiKey: "k",
      requestUri: "http://localhost:8975/auth/callback?code=c",
      sessionId: "sess-1",
    });
    deepStrictEqual(exchange, {
      kind: "need_confirmation",
      confirmation: {
        providerId: "microsoft.com",
        email: null,
        oauthIdToken: "ms-id-token",
        oauthAccessToken: "ms-access",
        pendingToken: "pending-1",
      },
    });
  });
});

describe("GCIP 200 answers that carry errorMessage", () => {
  it("throws the mapped GCIP error, not malformed_response", async () => {
    answer(200, { errorMessage: "FEDERATED_USER_ID_ALREADY_LINKED" });
    await rejects(
      signInWithIdp({ apiKey: "k", providerId: "google.com", idToken: "t" }),
      (e: unknown) =>
        e instanceof IdentityError &&
        e.code === "identity_already_linked" &&
        e.rawCode === "FEDERATED_USER_ID_ALREADY_LINKED" &&
        e.httpStatus === 200,
    );
  });
});
