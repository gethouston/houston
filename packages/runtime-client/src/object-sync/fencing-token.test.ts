import { expect, test } from "vitest";
import { captureFencingToken } from "./fencing-token";

test("takes a published token when the boot has none", () => {
  const fence: { token?: string } = {};
  captureFencingToken(fence, "7");
  expect(fence.token).toBe("7");
});

test("moves only forward: a replica's cached older token never replaces the boot's own", () => {
  const fence: { token?: string } = { token: "12" };
  captureFencingToken(fence, "11");
  expect(fence.token).toBe("12");
  captureFencingToken(fence, "12");
  expect(fence.token).toBe("12");
  captureFencingToken(fence, "13");
  expect(fence.token).toBe("13");
});

test("ignores an absent or malformed header", () => {
  const fence: { token?: string } = { token: "3" };
  captureFencingToken(fence, null);
  captureFencingToken(fence, "");
  captureFencingToken(fence, "not-a-number");
  expect(fence.token).toBe("3");
});
