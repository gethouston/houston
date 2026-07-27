import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { UserProfile } from "../src/hooks/queries/use-user-profiles.ts";
import {
  collectTaughtByIds,
  type LearningProvenanceSource,
  resolveLearningProvenance,
} from "../src/lib/learning-provenance.ts";

/**
 * Learning provenance (HOU-946): every learning links to the person who taught
 * it and the mission it came from. These pin the two fallback ladders that make
 * that readable on EVERY deployment — including desktop, where there is no
 * roster to resolve names or photos from.
 */

const profiles = (rows: UserProfile[]): Map<string, UserProfile> =>
  new Map(rows.map((r) => [r.userId, r]));

const NO_PROFILES = profiles([]);
const NO_MISSIONS = new Map<string, string>();

describe("resolveLearningProvenance", () => {
  it("returns null when a learning carries no provenance at all", () => {
    strictEqual(resolveLearningProvenance({}, NO_PROFILES, NO_MISSIONS), null);
  });

  it("prefers the live profile name and photo over the stored name", () => {
    const view = resolveLearningProvenance(
      { taughtBy: { user_id: "u1", name: "Old Name" } },
      profiles([
        { userId: "u1", name: "Felipe Ruiz", avatarUrl: "https://x/f.png" },
      ]),
      NO_MISSIONS,
    );
    deepStrictEqual(view, {
      name: "Felipe Ruiz",
      personId: "u1",
      photoUrl: "https://x/f.png",
    });
  });

  it("falls back to the STORED name when no roster resolves (desktop)", () => {
    const view = resolveLearningProvenance(
      { taughtBy: { user_id: "u1", name: "Felipe" } },
      NO_PROFILES,
      NO_MISSIONS,
    );
    // The id rides along as the face's tone key even with no roster.
    deepStrictEqual(view, { name: "Felipe", personId: "u1" });
  });

  it("prefers the LIVE mission title so a rename reads correctly", () => {
    const view = resolveLearningProvenance(
      { missionId: "act-1", missionTitle: "Q3 pipeline" },
      NO_PROFILES,
      new Map([["act-1", "Q3 pipeline review"]]),
    );
    deepStrictEqual(view, { mission: "Q3 pipeline review" });
  });

  it("falls back to the stored title when the mission is gone", () => {
    const view = resolveLearningProvenance(
      { missionId: "act-gone", missionTitle: "Q3 pipeline" },
      NO_PROFILES,
      new Map([["act-1", "Something else"]]),
    );
    deepStrictEqual(view, { mission: "Q3 pipeline" });
  });

  it("carries both halves when both are known", () => {
    const view = resolveLearningProvenance(
      { taughtBy: { user_id: "u1", name: "Felipe" }, missionId: "act-1" },
      NO_PROFILES,
      new Map([["act-1", "Q3 pipeline"]]),
    );
    deepStrictEqual(view, {
      name: "Felipe",
      personId: "u1",
      mission: "Q3 pipeline",
    });
  });

  it("an id with no resolvable name and no mission renders nothing", () => {
    // A stamped id whose owner left the org and whose name was never stored:
    // an id slice is not a person, so the line is omitted entirely.
    strictEqual(
      resolveLearningProvenance(
        { taughtBy: { user_id: "u-ghost" } },
        NO_PROFILES,
        NO_MISSIONS,
      ),
      null,
    );
  });

  it("an unnameable id carries NO personId onto a mission-only line", () => {
    // Same rule one level down: the mission keeps the line alive, but there is
    // no person to draw, so nothing hands the face a tone key.
    deepStrictEqual(
      resolveLearningProvenance(
        { taughtBy: { user_id: "u-ghost" }, missionId: "act-1" },
        NO_PROFILES,
        new Map([["act-1", "Q3 pipeline"]]),
      ),
      { mission: "Q3 pipeline" },
    );
  });
});

describe("collectTaughtByIds", () => {
  it("dedupes and skips rows with no person", () => {
    const rows: LearningProvenanceSource[] = [
      { taughtBy: { user_id: "u1" } },
      { taughtBy: { user_id: "u1", name: "Dup" } },
      { missionId: "act-1" },
      { taughtBy: { user_id: "u2" } },
    ];
    deepStrictEqual(collectTaughtByIds(rows), ["u1", "u2"]);
  });

  it("is empty for a set with no provenance", () => {
    deepStrictEqual(collectTaughtByIds([{}, {}]), []);
  });
});
