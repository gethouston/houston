import { LINKEDIN_REFUSALS } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import {
  isExpectedLinkedInRefusal,
  isLinkedInUnavailableError,
  LINKEDIN_CONNECT_POLL_MS,
  LINKEDIN_CONNECT_WATCH_MS,
  LINKEDIN_FEED_URL,
  linkedInConnectPollMs,
  linkedInPostLink,
  linkedInRefusalAction,
  linkedInRetryMinutes,
  startLinkedInConnectWatch,
} from "./policy";

describe("after a post", () => {
  it("links the post, or the feed when LinkedIn named none", () => {
    const url = "https://www.linkedin.com/feed/update/urn:li:share:7/";
    expect(linkedInPostLink(url)).toBe(url);
    expect(linkedInPostLink(null)).toBe(LINKEDIN_FEED_URL);
  });

  it("rounds a rate limit's wait up to whole minutes", () => {
    expect(linkedInRetryMinutes(undefined)).toBeNull();
    expect(linkedInRetryMinutes(0)).toBeNull();
    expect(linkedInRetryMinutes(1_000)).toBe(1);
    expect(linkedInRetryMinutes(60_000)).toBe(1);
    expect(linkedInRetryMinutes(61_000)).toBe(2);
    expect(linkedInRetryMinutes(3_600_000)).toBe(60);
  });
});

describe("the connect watch", () => {
  const watch = startLinkedInConnectWatch(1_000);

  it("polls every two seconds while nothing has landed", () => {
    expect(linkedInConnectPollMs(watch, { connected: false }, 1_000)).toBe(
      LINKEDIN_CONNECT_POLL_MS,
    );
    expect(LINKEDIN_CONNECT_POLL_MS).toBe(2_000);
    expect(linkedInConnectPollMs(watch, undefined, 5_000)).toBe(2_000);
  });

  it("stops when the connection lands", () => {
    expect(
      linkedInConnectPollMs(
        watch,
        { connected: true, name: "Ada", expiresAt: "2026-12-01T00:00:00Z" },
        2_000,
      ),
    ).toBe(false);
  });

  it("gives up after ten minutes", () => {
    expect(LINKEDIN_CONNECT_WATCH_MS).toBe(600_000);
    const end = 1_000 + LINKEDIN_CONNECT_WATCH_MS;
    expect(linkedInConnectPollMs(watch, { connected: false }, end - 1)).toBe(
      2_000,
    );
    expect(linkedInConnectPollMs(watch, { connected: false }, end)).toBe(false);
  });

  it("never polls with no watch (the dialog closed)", () => {
    expect(linkedInConnectPollMs(null, { connected: false }, 0)).toBe(false);
  });
});

describe("what a refusal means", () => {
  it.each([
    ["linkedin_not_connected", "reconnect"],
    ["rate_limited", "wait"],
    ["linkedin_failed", "retry"],
    ["offline", "offline"],
    ["not_configured", "fallback"],
    ["signed_out", "quiet"],
    ["invalid_text", "report"],
    ["invalid_image", "report"],
    ["no_image", "report"],
    ["invalid_aspect_ratio", "report"],
    ["image_too_large", "report"],
    ["unsupported_media_type", "report"],
  ] as const)("%s → %s", (code, action) => {
    expect(linkedInRefusalAction(code)).toBe(action);
  });

  it("keeps quiet about exactly the states nothing in Houston did wrong", () => {
    const quiet = LINKEDIN_REFUSALS.filter(isExpectedLinkedInRefusal);
    expect(quiet).toEqual([
      "not_configured",
      "linkedin_not_connected",
      "rate_limited",
      "linkedin_failed",
      "signed_out",
      "offline",
    ]);
  });
});

describe("isLinkedInUnavailableError", () => {
  const error = (status: number, body: unknown) =>
    Object.assign(new Error(typeof body === "string" ? body : ""), {
      status,
      body,
    });

  it("reads a deployment with no LinkedIn from either error shape", () => {
    expect(
      isLinkedInUnavailableError(error(503, { code: "not_configured" })),
    ).toBe(true);
    expect(
      isLinkedInUnavailableError(
        Object.assign(new Error('{"code":"not_configured","error":"x"}'), {
          status: 503,
        }),
      ),
    ).toBe(true);
    expect(isLinkedInUnavailableError(error(404, {}))).toBe(true);
    expect(isLinkedInUnavailableError(error(501, {}))).toBe(true);
  });

  it("leaves every other failure to be reported", () => {
    expect(
      isLinkedInUnavailableError(error(503, { error: "gateway_draining" })),
    ).toBe(false);
    expect(isLinkedInUnavailableError(error(500, {}))).toBe(false);
    expect(isLinkedInUnavailableError(new Error("x"))).toBe(false);
    expect(isLinkedInUnavailableError(null)).toBe(false);
  });
});
