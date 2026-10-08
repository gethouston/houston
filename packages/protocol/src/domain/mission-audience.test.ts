import { expect, test } from "vitest";
import { missionAudience } from "./mission-audience";

test("unknown and unattributed missions reach every eligible member", () => {
  expect(missionAudience(undefined)).toEqual({ everyone: true });
  expect(missionAudience({})).toEqual({ everyone: true });
});

test("creator, contributors, and other-authored mentions are deduplicated", () => {
  expect(
    missionAudience({
      created_by: "owner",
      contributors: [{ user_id: "owner" }, { user_id: "peer" }],
      mentioned: [
        { user_id: "reader", at: "now", by: "owner" },
        { user_id: "self", at: "now", by: "self" },
      ],
    }),
  ).toEqual({ user_ids: ["owner", "peer", "reader"] });
});

test("an oversized aggregate fails open instead of dropping eligible users", () => {
  expect(
    missionAudience({
      contributors: Array.from({ length: 65 }, (_, i) => ({
        user_id: String(i),
      })),
    }),
  ).toEqual({ everyone: true });
});
