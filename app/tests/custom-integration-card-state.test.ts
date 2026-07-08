import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  canSubmitKey,
  customFaviconUrl,
  deriveCustomCardView,
  hostnameFromBaseUrl,
} from "../src/components/custom-integration-card-state.ts";

describe("hostnameFromBaseUrl", () => {
  it("extracts the host from a valid https base URL", () => {
    strictEqual(hostnameFromBaseUrl("https://api.acme.com/v2"), "api.acme.com");
    strictEqual(
      hostnameFromBaseUrl("https://api.example.com:8443/base?x=1"),
      "api.example.com",
    );
  });

  it("degrades to the raw trimmed value for a malformed URL", () => {
    strictEqual(hostnameFromBaseUrl("  not a url  "), "not a url");
    strictEqual(hostnameFromBaseUrl(""), "");
  });
});

describe("customFaviconUrl", () => {
  it("builds a favicon URL from the host", () => {
    strictEqual(
      customFaviconUrl("https://api.acme.com/v2"),
      "https://www.google.com/s2/favicons?domain=api.acme.com&sz=128",
    );
  });

  it("returns null when the base URL has no parseable host", () => {
    strictEqual(customFaviconUrl("nonsense"), null);
    strictEqual(customFaviconUrl(""), null);
  });
});

describe("canSubmitKey", () => {
  it("requires a non-empty, non-whitespace key within the length bound", () => {
    strictEqual(canSubmitKey(""), false);
    strictEqual(canSubmitKey("   "), false);
    strictEqual(canSubmitKey("sk-abc123"), true);
    strictEqual(canSubmitKey("a".repeat(4096)), true);
    strictEqual(canSubmitKey("a".repeat(4097)), false);
  });
});

describe("deriveCustomCardView", () => {
  it("done wins over an in-flight submit; else submitting; else idle", () => {
    strictEqual(deriveCustomCardView(true, true), "done");
    strictEqual(deriveCustomCardView(false, true), "done");
    strictEqual(deriveCustomCardView(true, false), "submitting");
    strictEqual(deriveCustomCardView(false, false), "idle");
  });
});
