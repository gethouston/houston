import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  connectOriginKey,
  inlineOwners,
} from "../src/components/integrations/connect-origin.ts";

/**
 * The catalog renders some apps TWICE — the curated "Most used" spotlight
 * repeats rows that also live in their own category section. Without an owner
 * rule both copies expand, so one click paints two identical waiting panels
 * (two live regions, two Cancel buttons) for one hand-off.
 */

const rendered = [
  { section: "__mostUsed", slugs: ["gmail", "slack"] },
  { section: "communication", slugs: ["slack", "discord"] },
];

describe("inlineOwners", () => {
  it("gives the expansion to the row the flow was STARTED from", () => {
    const fromCategory = connectOriginKey(
      "integrations",
      "communication",
      "slack",
    );
    const owners = inlineOwners(rendered, "integrations", {
      slack: fromCategory,
    });
    strictEqual(owners.get("slack"), fromCategory);
  });

  it("names exactly ONE owner per app, whichever copy started it", () => {
    const fromSpotlight = connectOriginKey(
      "integrations",
      "__mostUsed",
      "slack",
    );
    const owners = inlineOwners(rendered, "integrations", {
      slack: fromSpotlight,
    });
    strictEqual(owners.get("slack"), fromSpotlight);
    strictEqual(owners.size, 3, "gmail, slack, discord — one owner each");
  });

  it("falls back to the first rendered copy when the origin row is gone", () => {
    // The user pressed the spotlight row, then searched: the spotlight only
    // exists at rest, so its row dropped out mid-hand-off. The live OAuth (and
    // its Cancel) must not vanish with it.
    const owners = inlineOwners(
      [{ section: "communication", slugs: ["slack"] }],
      "integrations",
      { slack: connectOriginKey("integrations", "__mostUsed", "slack") },
    );
    strictEqual(
      owners.get("slack"),
      connectOriginKey("integrations", "communication", "slack"),
    );
  });

  it("keys rows by SURFACE too, so the agent tab never claims the page's row", () => {
    const owners = inlineOwners(rendered, "agent:a1", {
      slack: connectOriginKey("integrations", "communication", "slack"),
    });
    strictEqual(
      owners.get("slack"),
      connectOriginKey("agent:a1", "__mostUsed", "slack"),
    );
  });

  it("assigns an owner to apps with no flow, ready for the next click", () => {
    const owners = inlineOwners(rendered, "integrations", {});
    strictEqual(
      owners.get("gmail"),
      connectOriginKey("integrations", "__mostUsed", "gmail"),
    );
    strictEqual(
      owners.get("discord"),
      connectOriginKey("integrations", "communication", "discord"),
    );
  });
});
