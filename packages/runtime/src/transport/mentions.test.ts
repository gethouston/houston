import {
  MENTION_NAME_MAX,
  MENTION_USER_ID_MAX,
  MENTIONS_MAX,
  MENTIONS_SCAN_MAX,
  parseMentions,
} from "@houston/protocol";
import { expect, test } from "vitest";
import { parseTurnRequest } from "../turn/types";

/**
 * The @mention send-body guard (HOU-944). `parseMentions` is the ONE place a
 * mention sidecar is trusted — the long-lived send route
 * (`conversation-routes.ts` → `handleStartTurn`), the cloud turn parser
 * (`turn/types.ts` → `parseTurnRequest`) and the host's forwarding hop all call
 * it — so a junk shape can never reach the transcript or the wire. It lives in
 * `@houston/protocol` beside `normalizeTurnMode` and is exercised here, where
 * both runtime readers live.
 */

test("a non-array is nothing at all", () => {
  expect(parseMentions(undefined)).toBeUndefined();
  expect(parseMentions(null)).toBeUndefined();
  expect(parseMentions("@ada")).toBeUndefined();
  expect(parseMentions(7)).toBeUndefined();
  expect(parseMentions({ userId: "u1" })).toBeUndefined();
});

test("well-formed entries survive with their order and names intact", () => {
  expect(
    parseMentions([{ userId: "u1", name: "Ada Lovelace" }, { userId: "u2" }]),
  ).toEqual([{ userId: "u1", name: "Ada Lovelace" }, { userId: "u2" }]);
});

test("an entry without a usable userId is dropped, the rest survive", () => {
  expect(
    parseMentions([
      { name: "Ada" }, // no userId
      { userId: "" }, // empty userId
      { userId: 42 }, // non-string userId
      null,
      "u3",
      ["u4"],
      { userId: "u5", name: "Grace" },
    ]),
  ).toEqual([{ userId: "u5", name: "Grace" }]);
});

test("a non-string name is dropped but the mention itself is kept", () => {
  // The userId is the load-bearing half (it is what a notification scans for);
  // a garbled name must never cost the user the mention.
  expect(parseMentions([{ userId: "u1", name: 42 }])).toEqual([
    { userId: "u1" },
  ]);
  expect(parseMentions([{ userId: "u1", name: null }])).toEqual([
    { userId: "u1" },
  ]);
});

test("the list is capped at MENTIONS_MAX", () => {
  const many = Array.from({ length: MENTIONS_MAX + 8 }, (_, i) => ({
    userId: `u${i}`,
  }));
  const parsed = parseMentions(many);
  expect(parsed).toHaveLength(MENTIONS_MAX);
  expect(parsed?.[MENTIONS_MAX - 1]).toEqual({
    userId: `u${MENTIONS_MAX - 1}`,
  });
});

test("a userId repeated across entries is kept once, first one wins", () => {
  // Otherwise one id could spend the whole MENTIONS_MAX budget and crowd the
  // real mentions out of the message.
  expect(
    parseMentions([
      { userId: "u1", name: "Ada" },
      { userId: "u1", name: "Impostor" },
      { userId: "u2" },
    ]),
  ).toEqual([{ userId: "u1", name: "Ada" }, { userId: "u2" }]);
});

test("an over-long userId or name is clipped, never dropped", () => {
  // The userId is what a notification scans for: an oversized one is a bad
  // client, not a reason to lose the mention.
  const parsed = parseMentions([
    { userId: "u".repeat(MENTION_USER_ID_MAX + 50), name: "x".repeat(9999) },
  ]);
  expect(parsed?.[0]?.userId).toHaveLength(MENTION_USER_ID_MAX);
  expect(parsed?.[0]?.name).toHaveLength(MENTION_NAME_MAX);
});

test("the scan stops after MENTIONS_SCAN_MAX entries", () => {
  // A junk array is not walked in full. A valid mention hiding past the scan
  // window is simply never seen.
  const junk = Array.from({ length: MENTIONS_SCAN_MAX + 500 }, () => null);
  expect(parseMentions(junk)).toBeUndefined();
  expect(parseMentions([...junk, { userId: "u_late" }])).toBeUndefined();
  const inWindow = [...junk.slice(0, MENTIONS_SCAN_MAX - 1), { userId: "u1" }];
  expect(parseMentions(inWindow)).toEqual([{ userId: "u1" }]);
});

test("an empty result is undefined, never [] — nothing empty rides the wire", () => {
  expect(parseMentions([])).toBeUndefined();
  expect(parseMentions([{ name: "Ada" }, null, 3])).toBeUndefined();
});

const TURN_BASE = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "c1",
  text: "hey @Ada",
  gcsPrefix: "ws/w1/a1",
};

test("parseTurnRequest runs the body's mentions through the same guard", () => {
  expect(
    parseTurnRequest({
      ...TURN_BASE,
      mentions: [{ userId: "u1", name: "Ada" }, { userId: "" }],
    }).mentions,
  ).toEqual([{ userId: "u1", name: "Ada" }]);
  expect(parseTurnRequest(TURN_BASE).mentions).toBeUndefined();
  expect(parseTurnRequest({ ...TURN_BASE, mentions: "u1" }).mentions).toBe(
    undefined,
  );
});
