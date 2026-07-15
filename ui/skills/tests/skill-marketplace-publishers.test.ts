import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { topPublishers } from "../src/skill-marketplace-grid-model.ts";
import type { CommunitySkill } from "../src/types.ts";

function skill(id: string, source: string): CommunitySkill {
  return { id, skillId: id, name: id, installs: 0, source };
}

describe("topPublishers", () => {
  it("returns [] for empty input", () => {
    assert.deepEqual(topPublishers([]), []);
  });

  it("returns a single publisher once, deduped", () => {
    const skills = [
      skill("a", "vercel/a"),
      skill("b", "vercel/b"),
      skill("c", "vercel/c"),
    ];
    assert.deepEqual(topPublishers(skills), ["vercel"]);
  });

  it("orders publishers by descending frequency", () => {
    const skills = [
      skill("a", "acme/a"),
      skill("b", "vercel/b"),
      skill("c", "vercel/c"),
      skill("d", "vercel/d"),
      skill("e", "acme/e"),
      skill("f", "solo/f"),
    ];
    // vercel:3, acme:2, solo:1
    assert.deepEqual(topPublishers(skills), ["vercel", "acme", "solo"]);
  });

  it("breaks frequency ties by first-seen order", () => {
    const skills = [
      skill("a", "beta/a"),
      skill("b", "alpha/b"),
      skill("c", "beta/c"),
      skill("d", "alpha/d"),
    ];
    // Both appear twice; beta was seen first.
    assert.deepEqual(topPublishers(skills), ["beta", "alpha"]);
  });

  it("caps the result at `max`", () => {
    const skills = [
      skill("a", "one/a"),
      skill("b", "two/b"),
      skill("c", "three/c"),
      skill("d", "four/d"),
    ];
    assert.deepEqual(topPublishers(skills, 2), ["one", "two"]);
    assert.equal(topPublishers(skills, 3).length, 3);
  });

  it("defaults the cap to 6", () => {
    const skills = Array.from({ length: 9 }, (_, i) =>
      skill(`s${i}`, `owner${i}/repo`),
    );
    assert.equal(topPublishers(skills).length, 6);
  });
});
