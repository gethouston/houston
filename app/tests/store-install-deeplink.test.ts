import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseStoreInstallSlug } from "../src/lib/store-install-slug.ts";

// The parser is the single security gate for the store-install deep link: on
// BOTH the desktop URL path and the web `?install=` path only a canonical slug
// (`^[a-z0-9][a-z0-9-]{0,63}$`, straight from @houston/agentstore-contract) may
// reach the seed flow. Everything else must return null.

describe("parseStoreInstallSlug — bare slug (web ?install= param)", () => {
  it("accepts a valid slug", () => {
    strictEqual(parseStoreInstallSlug("my-agent"), "my-agent");
  });

  it("accepts a single-character slug", () => {
    strictEqual(parseStoreInstallSlug("a"), "a");
  });

  it("rejects uppercase", () => {
    strictEqual(parseStoreInstallSlug("My-Agent"), null);
  });

  it("rejects path traversal", () => {
    strictEqual(parseStoreInstallSlug("../evil"), null);
    strictEqual(parseStoreInstallSlug("a/b"), null);
  });

  it("rejects an injected query", () => {
    strictEqual(parseStoreInstallSlug("good&install=evil"), null);
    strictEqual(parseStoreInstallSlug("good?x=1"), null);
  });

  it("rejects a leading hyphen", () => {
    strictEqual(parseStoreInstallSlug("-nope"), null);
  });

  it("rejects empty", () => {
    strictEqual(parseStoreInstallSlug(""), null);
  });

  it("rejects a slug over 64 characters", () => {
    strictEqual(parseStoreInstallSlug("a".repeat(65)), null);
  });
});

describe("parseStoreInstallSlug — houston://store/install URL", () => {
  it("extracts a valid slug", () => {
    strictEqual(
      parseStoreInstallSlug("houston://store/install?slug=my-agent"),
      "my-agent",
    );
  });

  it("accepts a trailing slash on the path", () => {
    strictEqual(
      parseStoreInstallSlug("houston://store/install/?slug=my-agent"),
      "my-agent",
    );
  });

  it("rejects a missing slug param", () => {
    strictEqual(parseStoreInstallSlug("houston://store/install"), null);
    strictEqual(parseStoreInstallSlug("houston://store/install?other=1"), null);
  });

  it("rejects an invalid slug in the param", () => {
    strictEqual(
      parseStoreInstallSlug("houston://store/install?slug=../evil"),
      null,
    );
    strictEqual(
      parseStoreInstallSlug("houston://store/install?slug=BadCase"),
      null,
    );
  });

  it("rejects a look-alike path (installEVIL guard)", () => {
    strictEqual(
      parseStoreInstallSlug("houston://store/installEVIL?slug=my-agent"),
      null,
    );
  });

  it("rejects a different host or path", () => {
    strictEqual(
      parseStoreInstallSlug("houston://store/uninstall?slug=my-agent"),
      null,
    );
    strictEqual(
      parseStoreInstallSlug("houston://evil/install?slug=my-agent"),
      null,
    );
  });

  it("rejects the auth deep-link channel", () => {
    strictEqual(
      parseStoreInstallSlug("houston://auth-callback?slug=my-agent"),
      null,
    );
  });

  it("rejects a non-houston scheme carrying a slug", () => {
    strictEqual(
      parseStoreInstallSlug("https://evil.com/store/install?slug=my-agent"),
      null,
    );
  });
});
