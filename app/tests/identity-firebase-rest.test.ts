import { rejects, strictEqual } from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { IdentityError } from "../src/lib/identity/errors.ts";
import {
  refreshIdToken,
  signInWithCustomToken,
  signInWithIdp,
  signInWithPassword,
} from "../src/lib/identity/firebase-rest.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  body: string;
}

/** Stub fetch with a fixed response; capture the last request. */
function stubFetch(status: number, body: unknown): { captured: Captured } {
  const captured: Captured = { url: "", body: "" };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured.url = String(url);
    captured.body = String(init?.body ?? "");
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
  return { captured };
}

function stubNetworkFailure(): void {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
}

/** Assert the thrown value is an IdentityError with the given code. */
function hasCode(code: string) {
  return (e: unknown) => e instanceof IdentityError && e.code === code;
}

const IDP_OK = {
  idToken: "id-1",
  refreshToken: "refresh-1",
  expiresIn: "3600",
  localId: "uid-1",
  email: "a@b.com",
  emailVerified: true,
  displayName: "Grace",
  providerId: "google.com",
};

describe("firebase-rest signInWithIdp", () => {
  it("normalizes the raw response and computes an absolute expiresAt", async () => {
    stubFetch(200, IDP_OK);
    const before = Date.now();
    const r = await signInWithIdp({
      apiKey: "k",
      providerId: "google.com",
      idToken: "google-id-token",
    });
    strictEqual(r.uid, "uid-1");
    strictEqual(r.email, "a@b.com");
    strictEqual(r.emailVerified, true);
    strictEqual(r.displayName, "Grace");
    strictEqual(r.expiresAt >= before + 3600 * 1000, true);
    strictEqual(r.expiresAt <= Date.now() + 3600 * 1000, true);
  });

  it("builds a postBody with the credential and provider id", async () => {
    const { captured } = stubFetch(200, IDP_OK);
    await signInWithIdp({
      apiKey: "the-key",
      providerId: "microsoft.com",
      idToken: "ms-id-token",
    });
    strictEqual(
      captured.url.includes("accounts:signInWithIdp?key=the-key"),
      true,
    );
    const payload = JSON.parse(captured.body) as { postBody: string };
    strictEqual(payload.postBody.includes("providerId=microsoft.com"), true);
    strictEqual(payload.postBody.includes("id_token=ms-id-token"), true);
  });

  it("throws invalid_idp_response WITHOUT a request when no credential given", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await rejects(
      signInWithIdp({ apiKey: "k", providerId: "google.com" }),
      hasCode("invalid_idp_response"),
    );
    strictEqual(called, false);
  });

  it("maps GCIP error codes to the taxonomy", async () => {
    const cases: Array<[string, string]> = [
      ["EMAIL_EXISTS", "email_exists"],
      ["INVALID_IDP_RESPONSE", "invalid_idp_response"],
      ["USER_DISABLED", "user_disabled"],
      ["OPERATION_NOT_ALLOWED", "operation_not_allowed"],
      ["TOO_MANY_ATTEMPTS_TRY_LATER", "too_many_attempts"],
      ["SOMETHING_WE_DONT_KNOW", "unknown"],
    ];
    for (const [raw, code] of cases) {
      stubFetch(400, { error: { code: 400, message: raw } });
      await rejects(
        signInWithIdp({ apiKey: "k", providerId: "google.com", idToken: "t" }),
        hasCode(code),
      );
    }
  });

  it("maps the code-less 'API key not valid' message", async () => {
    stubFetch(400, {
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
      },
    });
    await rejects(
      signInWithIdp({ apiKey: "bad", providerId: "google.com", idToken: "t" }),
      hasCode("api_key_invalid"),
    );
  });

  it("maps a thrown fetch to network", async () => {
    stubNetworkFailure();
    await rejects(
      signInWithIdp({ apiKey: "k", providerId: "google.com", idToken: "t" }),
      hasCode("network"),
    );
  });

  it("maps a 2xx body missing required fields to malformed_response", async () => {
    stubFetch(200, { refreshToken: "r", expiresIn: "3600", localId: "u" });
    await rejects(
      signInWithIdp({ apiKey: "k", providerId: "google.com", idToken: "t" }),
      hasCode("malformed_response"),
    );
  });
});

describe("firebase-rest signInWithPassword", () => {
  it("maps bad credentials to invalid_credentials", async () => {
    stubFetch(400, {
      error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" },
    });
    await rejects(
      signInWithPassword({ apiKey: "k", email: "a@b.com", password: "x" }),
      hasCode("invalid_credentials"),
    );
  });
});

describe("firebase-rest signInWithCustomToken", () => {
  it("returns tokens from the exchange", async () => {
    stubFetch(200, { idToken: "id-2", refreshToken: "r-2", expiresIn: "3600" });
    const r = await signInWithCustomToken({ apiKey: "k", customToken: "ct" });
    strictEqual(r.idToken, "id-2");
    strictEqual(r.refreshToken, "r-2");
  });

  it("maps an invalid custom token", async () => {
    stubFetch(400, { error: { code: 400, message: "INVALID_CUSTOM_TOKEN" } });
    await rejects(
      signInWithCustomToken({ apiKey: "k", customToken: "bad" }),
      hasCode("invalid_custom_token"),
    );
  });
});

describe("firebase-rest refreshIdToken", () => {
  it("maps snake_case securetoken fields to camelCase", async () => {
    const { captured } = stubFetch(200, {
      id_token: "id-3",
      refresh_token: "r-3",
      expires_in: "3600",
    });
    const r = await refreshIdToken({ apiKey: "k", refreshToken: "rt" });
    strictEqual(r.idToken, "id-3");
    strictEqual(r.refreshToken, "r-3");
    strictEqual(captured.body.includes("grant_type=refresh_token"), true);
    strictEqual(captured.body.includes("refresh_token=rt"), true);
  });

  it("maps TOKEN_EXPIRED and INVALID_REFRESH_TOKEN", async () => {
    stubFetch(400, { error: { code: 400, message: "TOKEN_EXPIRED" } });
    await rejects(
      refreshIdToken({ apiKey: "k", refreshToken: "rt" }),
      hasCode("token_expired"),
    );
    stubFetch(400, { error: { code: 400, message: "INVALID_REFRESH_TOKEN" } });
    await rejects(
      refreshIdToken({ apiKey: "k", refreshToken: "rt" }),
      hasCode("invalid_refresh_token"),
    );
  });
});
