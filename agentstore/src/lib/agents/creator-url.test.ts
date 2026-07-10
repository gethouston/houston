import { creatorSchema } from "@houston/agentstore-contract";
import { describe, expect, it } from "vitest";
import { normalizeCreatorUrl, publishErrorMessage } from "./creator-url";

describe("normalizeCreatorUrl", () => {
  it("treats empty / whitespace input as an absent (optional) link", () => {
    expect(normalizeCreatorUrl("")).toEqual({ ok: true, url: undefined });
    expect(normalizeCreatorUrl("   ")).toEqual({ ok: true, url: undefined });
  });

  it("prepends https:// to a scheme-less bare domain so it publishes cleanly", () => {
    // Reproduces the defect root cause: the raw value a non-technical user types
    // ("mysite.com") is REJECTED by the store's https-only creatorSchema...
    expect(creatorSchema.shape.url.safeParse("mysite.com").success).toBe(false);
    // ...but after normalization it is a valid https URL the PATCH route accepts.
    expect(normalizeCreatorUrl("mysite.com")).toEqual({
      ok: true,
      url: "https://mysite.com",
    });
    expect(
      creatorSchema.shape.url.safeParse("https://mysite.com").success,
    ).toBe(true);
  });

  it("keeps an already-valid https URL unchanged", () => {
    expect(normalizeCreatorUrl("  https://ada.dev/agents  ")).toEqual({
      ok: true,
      url: "https://ada.dev/agents",
    });
  });

  it("rejects an http:// link with an inline hint instead of silently upgrading it", () => {
    const result = normalizeCreatorUrl("http://mysite.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/https:\/\//);
  });

  it("rejects a value that cannot become a valid URL", () => {
    expect(normalizeCreatorUrl("not a url at all").ok).toBe(false);
  });
});

describe("publishErrorMessage", () => {
  it("maps known error codes to friendly copy", () => {
    expect(publishErrorMessage("rate_limited", 429)).toMatch(/wait a minute/i);
    expect(publishErrorMessage("unauthorized", 401)).toMatch(/claim link/i);
    expect(publishErrorMessage("slug_exhausted", 409)).toMatch(/creator name/i);
  });

  it("falls back to a status-tagged message for unknown codes", () => {
    expect(publishErrorMessage(undefined, 500)).toBe(
      "Publishing failed (500). Please try again.",
    );
  });
});
