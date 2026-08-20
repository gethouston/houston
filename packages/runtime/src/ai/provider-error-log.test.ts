import { afterEach, describe, expect, it, vi } from "vitest";
import { logProviderError } from "./provider-error-log";

describe("logProviderError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs an unauthenticated failure at error level with its cause on the line", () => {
    // The `cause=` field is what the Sentry capture regex turns into the
    // `provider_error_cause` tag (PRODUCT-1302) — the line format is a
    // contract with runtime-client sentry/client.ts PROVIDER_ERROR_LINE.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logProviderError(
      {
        kind: "unauthenticated",
        provider: "anthropic",
        cause: "token_revoked",
        message: "401 OAuth access token has been revoked",
      },
      { model: "claude-fable-5", status: 401 },
    );
    expect(error).toHaveBeenCalledWith(
      "[provider_error] provider=anthropic model=claude-fable-5 status=401 " +
        "kind=unauthenticated cause=token_revoked :: 401 OAuth access token has been revoked",
    );
  });

  it("keeps never-connected (no_credentials) a warning, still carrying the cause", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logProviderError({
      kind: "unauthenticated",
      provider: "google",
      cause: "no_credentials",
      message: "Provider is not configured: google",
    });
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("kind=unauthenticated cause=no_credentials ::"),
    );
  });

  it("puts the SDK error slug BEFORE kind, and cause right after it (the regex contract)", () => {
    // `[provider_error] provider=X model=Y status=Z error=SLUG kind=K cause=C :: text`
    // — the exact shape runtime-client sentry/client.ts PROVIDER_ERROR_LINE
    // captures into the (provider, kind, cause, sdk-slug) fingerprint.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logProviderError(
      {
        kind: "unauthenticated",
        provider: "anthropic",
        cause: "org_policy_blocked",
        message: "Your organization has disabled Claude subscription access",
      },
      {
        model: "claude-fable-5",
        status: 403,
        sdkError: "oauth_org_not_allowed",
      },
    );
    expect(error).toHaveBeenCalledWith(
      "[provider_error] provider=anthropic model=claude-fable-5 status=403 " +
        "error=oauth_org_not_allowed kind=unauthenticated cause=org_policy_blocked " +
        ":: Your organization has disabled Claude subscription access",
    );
  });

  it("keeps org_policy_blocked at error level — broken access, not an expected user state", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logProviderError({
      kind: "unauthenticated",
      provider: "anthropic",
      cause: "org_policy_blocked",
      message: "Your organization has disabled Claude subscription access",
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        "kind=unauthenticated cause=org_policy_blocked ::",
      ),
    );
  });

  it("emits no cause field for non-auth kinds", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logProviderError(
      {
        kind: "rate_limited",
        provider: "openai-codex",
        model: "gpt-5.5",
        retry_after_seconds: 30,
        message: "429 too many requests",
      },
      { model: "gpt-5.5", status: 429 },
    );
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining("cause="));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("kind=rate_limited ::"),
    );
  });
});
