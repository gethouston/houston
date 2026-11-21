import { expect, test } from "vitest";
import { claudeFlagsFileName } from "./claude-flags-path";

test("names a member's cache by the first 16 hex of the id's SHA-256", () => {
  expect(claudeFlagsFileName("user-alice")).toBe("0e7b8c3e3b7f94ed.json");
});
