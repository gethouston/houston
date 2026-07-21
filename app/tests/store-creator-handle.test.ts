import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseStoreCreatorHandle } from "../src/lib/store-creator-handle.ts";

// The parser is the single security gate for the store-creator deep link: on
// BOTH the desktop URL path and the web `?creator=` path only a canonical
// @handle (`^[a-z0-9][a-z0-9_]{1,29}$`, straight from @houston/agentstore-contract,
// after `normalizeHandle`) may reach the profile pane. Everything else returns
// null.

describe("parseStoreCreatorHandle — bare handle (web ?creator= param)", () => {
  it("accepts a valid handle", () => {
    strictEqual(parseStoreCreatorHandle("felipe"), "felipe");
  });

  it("accepts a two-character handle (minimum length)", () => {
    strictEqual(parseStoreCreatorHandle("ab"), "ab");
  });

  it("accepts underscores and digits after the first char", () => {
    strictEqual(parseStoreCreatorHandle("a_1_b2"), "a_1_b2");
  });

  it("normalizes a leading @, surrounding space, and case", () => {
    strictEqual(parseStoreCreatorHandle("  @Felipe "), "felipe");
    strictEqual(parseStoreCreatorHandle("HOUSTONBUILDER"), "houstonbuilder");
  });

  it("accepts a 30-character handle and rejects 31", () => {
    strictEqual(parseStoreCreatorHandle("a".repeat(30)), "a".repeat(30));
    strictEqual(parseStoreCreatorHandle("a".repeat(31)), null);
  });

  it("rejects a single-character handle (below minimum)", () => {
    strictEqual(parseStoreCreatorHandle("a"), null);
  });

  it("rejects a leading underscore or digit-free grammar break", () => {
    strictEqual(parseStoreCreatorHandle("_lead"), null);
  });

  it("rejects hyphens (a slug grammar, not a handle)", () => {
    strictEqual(parseStoreCreatorHandle("has-hyphen"), null);
  });

  it("rejects path traversal and slashes", () => {
    strictEqual(parseStoreCreatorHandle("../evil"), null);
    strictEqual(parseStoreCreatorHandle("a/b"), null);
  });

  it("rejects an injected query", () => {
    strictEqual(parseStoreCreatorHandle("good&creator=evil"), null);
    strictEqual(parseStoreCreatorHandle("good?x=1"), null);
  });

  it("rejects whitespace inside and empty", () => {
    strictEqual(parseStoreCreatorHandle("with space"), null);
    strictEqual(parseStoreCreatorHandle(""), null);
  });
});

describe("parseStoreCreatorHandle — houston://store/creator URL", () => {
  it("extracts a valid handle", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://store/creator?handle=felipe"),
      "felipe",
    );
  });

  it("accepts a trailing slash on the path", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://store/creator/?handle=felipe"),
      "felipe",
    );
  });

  it("normalizes the handle carried in the param", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://store/creator?handle=Felipe"),
      "felipe",
    );
  });

  it("rejects a missing handle param", () => {
    strictEqual(parseStoreCreatorHandle("houston://store/creator"), null);
    strictEqual(
      parseStoreCreatorHandle("houston://store/creator?other=1"),
      null,
    );
  });

  it("rejects an invalid handle in the param", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://store/creator?handle=../evil"),
      null,
    );
    strictEqual(
      parseStoreCreatorHandle("houston://store/creator?handle=a"),
      null,
    );
  });

  it("rejects a look-alike path (creatorEVIL guard)", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://store/creatorEVIL?handle=felipe"),
      null,
    );
  });

  it("rejects the install channel and other hosts/paths", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://store/install?handle=felipe"),
      null,
    );
    strictEqual(
      parseStoreCreatorHandle("houston://evil/creator?handle=felipe"),
      null,
    );
  });

  it("rejects the auth deep-link channel", () => {
    strictEqual(
      parseStoreCreatorHandle("houston://auth-callback?handle=felipe"),
      null,
    );
  });

  it("rejects a non-houston scheme carrying a handle", () => {
    strictEqual(
      parseStoreCreatorHandle("https://evil.com/store/creator?handle=felipe"),
      null,
    );
  });
});
