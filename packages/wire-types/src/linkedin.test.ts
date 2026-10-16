import { describe, expect, test } from "vitest";
import {
  LINKEDIN_REFUSALS,
  linkedInBodyCode,
  linkedInCommentaryLength,
  linkedInConnectionSchema,
  linkedInConnectSchema,
  linkedInPostedSchema,
  linkedInRefusalOf,
} from "./linkedin";

const body = (code: string) => JSON.stringify({ code, error: "message" });

describe("linkedInRefusalOf", () => {
  test.each([
    [400, body("invalid_text"), "invalid_text"],
    [400, body("invalid_image"), "invalid_image"],
    [400, body("no_image"), "no_image"],
    [400, body("invalid_aspect_ratio"), "invalid_aspect_ratio"],
    [401, "", "signed_out"],
    [404, "", "not_configured"],
    [405, "", "not_configured"],
    [501, "", "not_configured"],
    [409, body("linkedin_not_connected"), "linkedin_not_connected"],
    [413, body("image_too_large"), "image_too_large"],
    [415, body("unsupported_media_type"), "unsupported_media_type"],
    [429, body("rate_limited"), "rate_limited"],
    [502, body("linkedin_failed"), "linkedin_failed"],
    [503, body("not_configured"), "not_configured"],
  ])("%i %s is %s", (status, raw, code) => {
    expect(linkedInRefusalOf(status, raw)).toBe(code);
    expect(LINKEDIN_REFUSALS).toContain(code);
  });

  test("reads the plain {error: code} envelope too", () => {
    expect(
      linkedInRefusalOf(503, JSON.stringify({ error: "not_configured" })),
    ).toBe("not_configured");
  });

  test.each([
    [400, body("something_else")],
    [400, "<html>"],
    [409, body("already_connected")],
    [500, body("linkedin_failed")],
    [502, "<html>bad gateway</html>"],
    [503, body("gateway_draining")],
  ])("%i %s is a failure, not a refusal", (status, raw) => {
    expect(linkedInRefusalOf(status, raw)).toBeNull();
  });

  test("a body that is not an object names no code", () => {
    expect(linkedInBodyCode("null")).toBeNull();
    expect(linkedInBodyCode('"x"')).toBeNull();
    expect(linkedInBodyCode("{")).toBeNull();
  });
});

describe("linkedin answers", () => {
  test("a connection is connected with a name and an expiry, or not", () => {
    expect(
      linkedInConnectionSchema.parse({
        connected: true,
        name: "Daniel Vélez",
        expiresAt: "2026-12-16T00:00:00Z",
      }),
    ).toEqual({
      connected: true,
      name: "Daniel Vélez",
      expiresAt: "2026-12-16T00:00:00Z",
    });
    expect(linkedInConnectionSchema.parse({ connected: false })).toEqual({
      connected: false,
    });
    expect(() =>
      linkedInConnectionSchema.parse({ connected: true, name: "x" }),
    ).toThrow();
  });

  test("only LinkedIn's own authorization page is taken", () => {
    const ok =
      "https://www.linkedin.com/oauth/v2/authorization?response_type=code&state=s";
    expect(linkedInConnectSchema.parse({ authorizeUrl: ok }).authorizeUrl).toBe(
      ok,
    );
    for (const bad of [
      "http://www.linkedin.com/oauth/v2/authorization",
      "https://evil.example/oauth/v2/authorization",
      "https://www.linkedin.com.evil.example/oauth/v2/authorization",
      "https://user:pw@www.linkedin.com/oauth/v2/authorization",
      "https://www.linkedin.com/feed/",
      "not a url",
    ])
      expect(() =>
        linkedInConnectSchema.parse({ authorizeUrl: bad }),
      ).toThrow();
  });

  test("a post links to LinkedIn's own feed page", () => {
    const posted = {
      postUrn: "urn:li:share:7",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:7/",
    };
    expect(linkedInPostedSchema.parse(posted)).toEqual(posted);
    expect(() =>
      linkedInPostedSchema.parse({
        ...posted,
        postUrl: "https://evil.example/feed/update/urn:li:share:7/",
      }),
    ).toThrow();
  });
});

describe("linkedInCommentaryLength", () => {
  test("counts each reserved character twice, as the gateway escapes it", () => {
    expect(linkedInCommentaryLength("plain words")).toBe(11);
    expect(linkedInCommentaryLength("\\|{}@[]()<>#*_~")).toBe(30);
    expect(linkedInCommentaryLength("#hiring @Acme (team_one)")).toBe(29);
  });

  test("counts code points, not UTF-16 units", () => {
    expect(linkedInCommentaryLength("🚀é")).toBe(2);
  });
});
