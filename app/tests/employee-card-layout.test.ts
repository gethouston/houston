import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = (file: string) =>
  readFileSync(
    join(import.meta.dirname, "../src/components/employee-card", file),
    "utf8",
  );

describe("employee card layout", () => {
  it("crops the engraving to the photo panel and keeps its hairlines", () => {
    const metal = source("employee-card-metal.tsx");
    assert.match(metal, /preserveAspectRatio="xMidYMid slice"/);
    assert.match(metal, /vectorEffect="non-scaling-stroke"/);
    assert.doesNotMatch(metal, /preserveAspectRatio="none"/);
  });

  it("sets the photo panel beside the badge's body, not above it", () => {
    const card = source("employee-card.tsx");
    assert.match(card, /@container relative isolate flex /);
    assert.match(card, /border-r border-line/);
    assert.doesNotMatch(card, /\bh-40\b/);
  });

  it("lays a team out by the deck's own width and never scrolls sideways", () => {
    const deck = source("employee-card-deck.tsx");
    assert.match(deck, /className="@container"/);
    assert.match(deck, /@5xl:grid-cols-3/);
    assert.doesNotMatch(deck, /overflow-x-auto|snap-x/);
  });
});
