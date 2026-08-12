import { beforeEach, expect, test, vi } from "vitest";
import { reportRevokedServedToken } from "../../auth/report-revoked";
import { classifyText, mapSdkError } from "./errors";

vi.mock("../../auth/report-revoked", () => ({
  reportRevokedServedToken: vi.fn(),
}));

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(reportRevokedServedToken).mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

test("expected external kinds log as warnings; auth and unknown stay errors", () => {
  mapSdkError("rate_limit", { message: "429 slow down", model: "m" });
  mapSdkError("overloaded", { message: "529 overloaded", model: "m" });
  expect(consoleWarn).toHaveBeenCalledTimes(2);
  expect(consoleError).not.toHaveBeenCalled();

  mapSdkError("authentication_failed", { message: "401 expired", model: "m" });
  expect(consoleError).toHaveBeenCalledOnce();
});

test("a fall-through enum logs exactly once (via the text classifier)", () => {
  mapSdkError("unknown", { message: "something odd", model: null });
  expect(consoleError.mock.calls.length + consoleWarn.mock.calls.length).toBe(
    1,
  );
});

test("authentication_failed → unauthenticated, cause read from the message text", () => {
  expect(
    mapSdkError("authentication_failed", {
      message: "401 OAuth token has expired",
      model: "claude-opus-4-5",
    }),
  ).toEqual({
    kind: "unauthenticated",
    provider: "anthropic",
    cause: "token_expired",
    message: "401 OAuth token has expired",
  });
});

test("authentication_failed → invalid_api_key / token_revoked / unknown causes", () => {
  expect(
    mapSdkError("authentication_failed", {
      message: "invalid API key provided",
      model: null,
    }).kind,
  ).toBe("unauthenticated");
  const revoked = mapSdkError("authentication_failed", {
    message: "Your session has ended. Please log in again.",
    model: null,
  });
  expect(revoked).toMatchObject({ cause: "token_revoked" });
  const unknown = mapSdkError("authentication_failed", {
    message: "not authorized",
    model: null,
  });
  expect(unknown).toMatchObject({ cause: "unknown" });
});

test("oauth_org_not_allowed → unauthenticated", () => {
  expect(
    mapSdkError("oauth_org_not_allowed", { message: "org policy", model: null })
      .kind,
  ).toBe("unauthenticated");
});

test("billing_error → quota_exhausted", () => {
  expect(
    mapSdkError("billing_error", { message: "billing issue", model: "m" }),
  ).toEqual({
    kind: "quota_exhausted",
    provider: "anthropic",
    model: "m",
    scope: "unknown",
    resets_at: null,
    message: "billing issue",
  });
});

test("rate_limit → rate_limited, retry from the rate_limit_event when present", () => {
  expect(
    mapSdkError("rate_limit", {
      message: "rate limited",
      model: "m",
      retryAfterSeconds: 42,
    }),
  ).toEqual({
    kind: "rate_limited",
    provider: "anthropic",
    model: "m",
    retry_after_seconds: 42,
    message: "rate limited",
  });
});

test("rate_limit → retry parsed from message text when no event seen", () => {
  expect(
    mapSdkError("rate_limit", {
      message: "Please try again in 30 seconds",
      model: null,
    }),
  ).toMatchObject({ kind: "rate_limited", retry_after_seconds: 30 });
});

test("overloaded / server_error → provider_internal with the http status", () => {
  expect(
    mapSdkError("overloaded", {
      message: "overloaded",
      model: null,
      status: 529,
    }),
  ).toEqual({
    kind: "provider_internal",
    provider: "anthropic",
    http_status: 529,
    message: "overloaded",
  });
  expect(
    mapSdkError("server_error", { message: "boom", model: null }),
  ).toMatchObject({ kind: "provider_internal", http_status: null });
});

test("model_not_found → model_unavailable when a model is named", () => {
  expect(
    mapSdkError("model_not_found", {
      message: "no such model",
      model: "claude-x",
    }),
  ).toEqual({
    kind: "model_unavailable",
    provider: "anthropic",
    model: "claude-x",
    reason: "unknown",
    suggested_fallback: null,
    message: "no such model",
  });
});

test("model_not_found with no model falls through to the text classifier", () => {
  // No model to name → cannot render the switch-model card; classify the text.
  expect(
    mapSdkError("model_not_found", {
      message: "does not exist or you do not have access",
      model: null,
    }).kind,
  ).not.toBe("model_unavailable");
});

test("invalid_request / max_output_tokens / unknown fall through to the classifier", () => {
  expect(
    mapSdkError("invalid_request", {
      message: "429 too many requests",
      model: null,
    }),
  ).toMatchObject({ kind: "rate_limited" });
  expect(
    mapSdkError("unknown", { message: "something weird", model: null }),
  ).toMatchObject({ kind: "unknown", raw_excerpt: "something weird" });
});

test("classifyText passes provider + status through the shared classifier", () => {
  expect(classifyText("Internal Server Error", "m", 500)).toEqual({
    kind: "provider_internal",
    provider: "anthropic",
    http_status: 500,
    message: "Internal Server Error",
  });
});

/**
 * PRODUCT-1307: a revocation is only healed centrally if the seam that
 * classified it also reports it. The enum path always did; the text path —
 * result `subtype !== "success"` and thrown/iterator failures — classified,
 * logged, and stayed silent, so a revocation surfacing there kept the dead
 * credential served to the whole workspace (Sentry HOUSTON-APP-4YA storms).
 * The reporter's own gates (confirmed marker, serve mode, served manifest,
 * oauth) remain the safety; the seam's job is just to always speak up.
 */
test("classifyText reports an unauthenticated failure like the enum path does", () => {
  const classified = classifyText(
    "Failed to authenticate. API Error: 401 OAuth access token has been revoked.",
    null,
    null,
  );
  expect(classified).toMatchObject({
    kind: "unauthenticated",
    provider: "anthropic",
    cause: "token_revoked",
  });
  // No spawn-token digest was captured → the reporter is told so (undefined)
  // and its unknown-token gate skips, rather than digesting a re-read of
  // auth.json that may already hold a healthy replacement (PRODUCT-1319).
  expect(reportRevokedServedToken).toHaveBeenCalledExactlyOnceWith(
    classified,
    undefined,
  );
});

test("classifyText does not report non-auth failures", () => {
  classifyText("Internal Server Error", "m", 500);
  expect(reportRevokedServedToken).not.toHaveBeenCalled();
});

/**
 * PRODUCT-1319: the report must name the token the failed turn RAN ON — the
 * digest captured at spawn preparation (the subprocess env token) — so both
 * seams thread it through to the reporter verbatim.
 */
test("both seams hand the spawn-time token digest to the reporter", () => {
  const viaText = classifyText(
    "401 OAuth access token has been revoked",
    null,
    null,
    "digest-of-the-spawn-token",
  );
  expect(reportRevokedServedToken).toHaveBeenCalledWith(
    viaText,
    "digest-of-the-spawn-token",
  );

  vi.mocked(reportRevokedServedToken).mockClear();
  const viaEnum = mapSdkError("authentication_failed", {
    message: "401 OAuth access token has been revoked",
    model: null,
    usedAccessDigest: "digest-of-the-spawn-token",
  });
  expect(reportRevokedServedToken).toHaveBeenCalledExactlyOnceWith(
    viaEnum,
    "digest-of-the-spawn-token",
  );
});

test("the verbatim provider text is logged once it is reduced to a card", () => {
  // An expected external kind (rate_limited) logs as a warning breadcrumb —
  // the verbatim provider text must still be in the line.
  mapSdkError("rate_limit", { message: "429 slow down", model: "m" });
  expect(consoleWarn).toHaveBeenCalledWith(
    expect.stringContaining("429 slow down"),
  );
  // A bug-signaling kind keeps the verbatim text on the error path.
  mapSdkError("authentication_failed", { message: "401 expired", model: "m" });
  expect(consoleError).toHaveBeenCalledWith(
    expect.stringContaining("401 expired"),
  );
});

/**
 * The enum-mapped cards bypass `classifyProviderError`, which is where every
 * other provider error gets its credential stamp — so they must stamp it
 * themselves. Without it, a member whose OWN Anthropic account is rate limited
 * reads a card that blames "Anthropic" in the abstract, on the provider whose
 * limits users hit most (HOU-976).
 */
test("an enum-mapped card carries the acting identity's credential stamp", async () => {
  const { runWithActingContext } = await import("../../session/acting-context");
  const { recordServedScope, resetServedScopes } = await import(
    "../../auth/served-scope"
  );
  resetServedScopes();
  const actingAs = `acting-v1.${Buffer.from(
    JSON.stringify({ sub: "sub-claude", agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url")}.sig`;
  runWithActingContext({ actingAs }, () => {
    recordServedScope("anthropic", "personal");
    expect(
      mapSdkError("rate_limit", { message: "429 slow down", model: "m" }),
    ).toMatchObject({
      kind: "rate_limited",
      credential: { scope: "personal" },
    });
    expect(
      mapSdkError("authentication_failed", {
        message: "401 expired",
        model: "m",
      }),
    ).toMatchObject({
      kind: "unauthenticated",
      credential: { scope: "personal" },
    });
  });
  resetServedScopes();
});
