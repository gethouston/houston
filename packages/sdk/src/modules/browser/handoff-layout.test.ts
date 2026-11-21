import { describe, expect, it } from "vitest";
import type { BrowserHandoffFeedItem } from "./handoff-calls";
import { browserHandoffFeedRows } from "./handoff-layout";

const T = { turnId: "t1" };
const user: BrowserHandoffFeedItem = {
  feed_type: "user_message",
  data: "Pay my bill",
  id: "u",
};
const thinking: BrowserHandoffFeedItem = {
  feed_type: "thinking",
  data: "plan",
  id: "th",
  ...T,
};
const reply = (feed_type: string): BrowserHandoffFeedItem => ({
  feed_type,
  data: "Please sign in below. Signed in, your balance is 10.",
  id: "reply",
  ...T,
});
const call = (
  id: string,
  input: unknown,
  toolIndex: number,
): BrowserHandoffFeedItem => ({
  feed_type: "tool_call",
  data: { name: "browser", input },
  id,
  toolIndex,
  ...T,
});
const result = (
  id: string,
  content: string,
  toolIndex: number,
): BrowserHandoffFeedItem => ({
  feed_type: "tool_result",
  data: { name: "browser", content, is_error: false },
  id,
  toolIndex,
  ...T,
});
const open = call("open", { action: "open", url: "https://bank.com" }, 0);
const opened = result("opened", "ok", 0);
const handoff = call("h", { action: "handoff", text: "Sign in" }, 1);
const handedBack = result("hr", "The person finished", 1);
const snap = call("snap", { action: "snapshot" }, 2);
const snapped = result("snapped", "page", 2);
const end: BrowserHandoffFeedItem = {
  feed_type: "final_result",
  data: {},
  id: "end",
  ...T,
};

function layout(items: BrowserHandoffFeedItem[], running: boolean): string[] {
  return browserHandoffFeedRows(items, running).map((row) =>
    row.kind === "card" ? "card" : (items[row.index].id ?? "?"),
  );
}

describe("browserHandoffFeedRows", () => {
  const live = [
    user,
    thinking,
    reply("assistant_text_streaming"),
    open,
    opened,
    handoff,
    handedBack,
    snap,
    snapped,
  ];
  const settled = [
    user,
    thinking,
    open,
    opened,
    handoff,
    handedBack,
    snap,
    snapped,
    reply("assistant_text"),
    end,
  ];
  const expected = [
    "u",
    "th",
    "open",
    "opened",
    "h",
    "hr",
    "card",
    "snap",
    "snapped",
    "reply",
  ];

  it("puts the card right after the hand-off and the running reply after the tools", () => {
    expect(layout(live, true)).toEqual(expected);
  });

  it("keeps the same order once the turn settled", () => {
    expect(layout(settled, false)).toEqual([...expected, "end"]);
  });

  it("keeps it when the live entry finalized in place", () => {
    const finalized = [
      ...live.slice(0, 2),
      reply("assistant_text"),
      ...live.slice(3),
      end,
    ];
    expect(layout(finalized, false)).toEqual([...expected, "end"]);
  });

  it("puts a waiting card after the call, the reply so far under it", () => {
    const waiting = [
      user,
      reply("assistant_text_streaming"),
      open,
      opened,
      handoff,
    ];
    expect(layout(waiting, true)).toEqual([
      "u",
      "open",
      "opened",
      "h",
      "card",
      "reply",
    ]);
  });

  it("leaves an earlier turn's reply where it is", () => {
    const earlier = { ...reply("assistant_text"), id: "old", turnId: "t0" };
    const items = [
      { ...user, id: "u0" },
      earlier,
      { feed_type: "final_result", data: {}, id: "e0" },
      user,
      open,
      opened,
      handoff,
    ];
    expect(layout(items, true)).toEqual([
      "u0",
      "old",
      "e0",
      "u",
      "open",
      "opened",
      "h",
      "card",
    ]);
  });

  it("draws a moved reply settled, waiting or handed back", () => {
    const waiting = [user, reply("assistant_text_streaming"), open, handoff];
    const replyRow = (items: BrowserHandoffFeedItem[], running: boolean) =>
      browserHandoffFeedRows(items, running).find(
        (row) => row.kind === "item" && items[row.index].id === "reply",
      );
    expect(replyRow(waiting, true)).toEqual({
      kind: "item",
      index: 1,
      settled: true,
    });
    expect(replyRow(live, true)).toEqual({
      kind: "item",
      index: 2,
      settled: true,
    });
  });

  describe("never pulls another turn's reply", () => {
    const bare = (item: BrowserHandoffFeedItem) => {
      const { turnId: _, ...rest } = item;
      return rest;
    };
    const old = { ...reply("assistant_text"), id: "old" };
    const restarted: BrowserHandoffFeedItem = {
      feed_type: "system_message",
      data: "Houston restarted",
      id: "sys",
    };

    it("across a stop or restart notice", () => {
      const items = [bare(old), restarted, bare(open), bare(handoff)];
      expect(layout(items, true)).toEqual(["old", "sys", "open", "h", "card"]);
    });

    it("when only the hand-off names its turn", () => {
      const items = [bare(old), open, handoff];
      expect(layout(items, true)).toEqual(["old", "open", "h", "card"]);
    });

    it("when only the reply names its turn", () => {
      const items = [old, bare(open), bare(handoff)];
      expect(layout(items, true)).toEqual(["old", "open", "h", "card"]);
    });

    it("past a row of another turn", () => {
      const t0 = { turnId: "t0" };
      const items = [
        bare(old),
        { ...open, ...t0 },
        { ...opened, ...t0 },
        { ...handoff, id: "h2", toolIndex: 0 },
      ];
      expect(layout(items, true)).toEqual([
        "old",
        "open",
        "opened",
        "h2",
        "card",
      ]);
    });
  });

  it("is the feed itself when no hand-off is in it", () => {
    expect(
      layout([user, reply("assistant_text"), open, opened], false),
    ).toEqual(["u", "reply", "open", "opened"]);
  });
});
