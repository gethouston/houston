import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONNECT_AI_FALLBACK,
  CONNECT_APPS_FALLBACK,
  pickConnectAppIds,
  pickConnectLogoIds,
} from "../src/components/shell/connect-group-logos.ts";

const always = () => true;

describe("pickConnectLogoIds", () => {
  it("draws the popular choices when nothing is connected", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: [],
        fallback: CONNECT_APPS_FALLBACK,
        drawable: always,
        max: 3,
      }),
      ["gmail", "outlook", "slack"],
    );
  });

  it("draws the popular choices while the answer is unknown", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: null,
        fallback: CONNECT_AI_FALLBACK,
        drawable: always,
        max: 3,
      }),
      ["anthropic", "openai", "google"],
    );
  });

  it("leads with what the person connected, then fills to three", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: ["hubspot"],
        fallback: CONNECT_APPS_FALLBACK,
        drawable: always,
        max: 3,
      }),
      ["hubspot", "gmail", "outlook"],
    );
  });

  it("draws at most max logos, connected ones winning", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: ["a", "b", "c", "d", "e"],
        fallback: CONNECT_APPS_FALLBACK,
        drawable: always,
        max: 3,
      }),
      ["a", "b", "c"],
    );
  });

  it("never draws a connected app twice when it is also a popular choice", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: ["slack", "gmail"],
        fallback: CONNECT_APPS_FALLBACK,
        drawable: always,
        max: 3,
      }),
      ["slack", "gmail", "outlook"],
    );
  });

  it("never lists a logo that cannot be drawn yet", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: ["notion", "hubspot"],
        fallback: CONNECT_APPS_FALLBACK,
        drawable: (id) => id !== "notion",
        max: 3,
      }),
      ["hubspot", "gmail", "outlook"],
    );
  });

  it("draws nothing when no logo can be drawn", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: null,
        fallback: CONNECT_APPS_FALLBACK,
        drawable: () => false,
        max: 3,
      }),
      [],
    );
  });

  it("draws two ids that share one logo once, fallback included", () => {
    assert.deepEqual(
      pickConnectLogoIds({
        connected: ["openai-codex", "openai"],
        fallback: CONNECT_AI_FALLBACK,
        drawable: always,
        identity: (id) => (id.startsWith("openai") ? "openai" : id),
        max: 3,
      }),
      ["openai-codex", "anthropic", "google"],
    );
  });

  it("has three popular choices per row, one stack's worth", () => {
    assert.equal(CONNECT_APPS_FALLBACK.length, 3);
    assert.equal(CONNECT_AI_FALLBACK.length, 3);
  });
});

describe("pickConnectAppIds", () => {
  const noCatalog = () => "";
  const catalog = (slug: string) => `https://logos.example/${slug}.svg`;

  it("draws the three popular apps with nothing connected and no catalog", () => {
    assert.deepEqual(
      pickConnectAppIds({ connected: null, knownLogo: noCatalog, max: 3 }),
      ["gmail", "outlook", "slack"],
    );
    assert.deepEqual(
      pickConnectAppIds({ connected: [], knownLogo: noCatalog, max: 3 }),
      ["gmail", "outlook", "slack"],
    );
  });

  it("leads with a connected app once the catalog knows its logo", () => {
    assert.deepEqual(
      pickConnectAppIds({ connected: ["hubspot"], knownLogo: catalog, max: 3 }),
      ["hubspot", "gmail", "outlook"],
    );
  });

  it("skips a connected app whose logo is not known yet", () => {
    assert.deepEqual(
      pickConnectAppIds({
        connected: ["hubspot"],
        knownLogo: noCatalog,
        max: 3,
      }),
      ["gmail", "outlook", "slack"],
    );
  });

  it("draws a connected Gmail once, before the catalog and after it", () => {
    for (const knownLogo of [noCatalog, catalog]) {
      assert.deepEqual(
        pickConnectAppIds({ connected: ["gmail"], knownLogo, max: 3 }),
        ["gmail", "outlook", "slack"],
      );
    }
  });
});
