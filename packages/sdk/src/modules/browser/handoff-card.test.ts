import { describe, expect, it } from "vitest";
import {
  type BrowserHandoffFeedItem,
  browserHandoffCards,
  isBrowserToolName,
} from "./handoff-card";

const user = (text: string): BrowserHandoffFeedItem => ({
  feed_type: "user_message",
  data: text,
});
const call = (
  input: unknown,
  name = "browser",
  id?: string,
): BrowserHandoffFeedItem => ({
  feed_type: "tool_call",
  data: { name, input },
  ...(id ? { id } : {}),
});
const result = (
  content: string,
  is_error = false,
  name: string | undefined = "browser",
): BrowserHandoffFeedItem => ({
  feed_type: "tool_result",
  data: { ...(name ? { name } : {}), content, is_error },
});
const handoff = (url?: string) => ({
  action: "handoff",
  text: "Sign in to your bank",
  ...(url ? { url } : {}),
});
const end: BrowserHandoffFeedItem = { feed_type: "final_result", data: {} };

describe("isBrowserToolName", () => {
  it("knows the bare and MCP-prefixed tool", () => {
    expect(isBrowserToolName("browser")).toBe(true);
    expect(isBrowserToolName("mcp__houston__browser")).toBe(true);
    expect(isBrowserToolName("browser_open")).toBe(false);
    expect(isBrowserToolName("bash")).toBe(false);
  });
});

describe("browserHandoffCards", () => {
  it("anchors a done hand-off after its result", () => {
    const items = [
      user("pay my bill"),
      call(handoff("https://www.bank.com/login"), "browser", "c1"),
      result("The person finished: ..."),
      end,
    ];
    expect(browserHandoffCards(items, false)).toEqual([
      {
        key: "c1:handoff",
        anchorIndex: 2,
        text: "Sign in to your bank",
        url: "https://www.bank.com/login",
        site: "bank.com",
        state: "done",
      },
    ]);
  });

  it("reads Claude's prefixed tool and skips its placeholder call", () => {
    const name = "mcp__houston__browser";
    const items = [
      user("go"),
      call(null, name),
      call(handoff("https://x.org"), name),
      result("ERROR handoff_cancelled: closed", true, name),
    ];
    const [card] = browserHandoffCards(items, false);
    expect(card).toMatchObject({
      key: "2:handoff",
      anchorIndex: 3,
      state: "cancelled",
    });
  });

  it("waits while its turn runs and ends once it no longer can", () => {
    const items = [user("go"), call(handoff())];
    expect(browserHandoffCards(items, true)[0]).toMatchObject({
      anchorIndex: 1,
      state: "waiting",
    });
    expect(browserHandoffCards(items, false)[0].state).toBe("ended");
    expect(browserHandoffCards([...items, end], true)[0].state).toBe("ended");
    expect(
      browserHandoffCards(
        [
          ...items,
          call({ command: "ls" }, "bash"),
          result("files", false, "bash"),
        ],
        true,
      )[0].state,
    ).toBe("ended");
  });

  it("keeps waiting when the same message asked for another tool too", () => {
    const items = [
      user("go"),
      call(handoff()),
      call({ command: "ls" }, "bash"),
    ];
    expect(browserHandoffCards(items, true)[0].state).toBe("waiting");
  });

  it("reads an empty success as ended: history's fill for an interrupted tool", () => {
    const items = [user("go"), call(handoff()), result(""), end];
    expect(browserHandoffCards(items, false)[0]).toMatchObject({
      anchorIndex: 2,
      state: "ended",
    });
  });

  it("an orphaned call of an earlier turn never takes a later result", () => {
    const items = [
      user("a"),
      call(handoff("https://a.com"), "browser", "old"),
      user("b"),
      call(handoff("https://b.com"), "browser", "new"),
      result("The person finished: b"),
    ];
    expect(
      browserHandoffCards(items, false).map((c) => [c.key, c.state]),
    ).toEqual([
      ["old:handoff", "ended"],
      ["new:handoff", "done"],
    ]);
  });

  it("pairs by turn and tool index when the rows carry them", () => {
    const tagged = (
      item: BrowserHandoffFeedItem,
      turnId: string,
      toolIndex: number,
    ) => ({ ...item, turnId, toolIndex });
    const items = [
      user("a"),
      tagged(call(handoff("https://a.com"), "browser", "t1"), "T1", 0),
      user("b"),
      tagged(call({ action: "open", url: "https://c.com" }), "T2", 0),
      call(handoff("https://b.com"), "browser", "t2"),
      tagged(result("ERROR handoff_expired: late", true), "T2", 1),
      tagged(result("opened"), "T2", 0),
    ];
    items[4] = tagged(items[4], "T2", 1);
    expect(
      browserHandoffCards(items, true).map((c) => [c.key, c.state]),
    ).toEqual([
      ["t1:handoff", "ended"],
      ["t2:handoff", "expired"],
    ]);
  });

  it("keeps waiting when the person writes while it waits", () => {
    const items = [user("go"), call(handoff()), user("done yet?")];
    expect(browserHandoffCards(items, true)[0].state).toBe("waiting");
  });

  it.each([
    ["ERROR handoff_expired: Nobody finished", "expired"],
    ["ERROR handoff_unavailable: no way", "ended"],
    ["ERROR page_error: The browser closed", "ended"],
  ])("maps %s to %s", (content, state) => {
    const items = [user("go"), call(handoff()), result(content, true)];
    expect(browserHandoffCards(items, false)[0].state).toBe(state);
  });

  it("pairs results in call order, an unnamed result included", () => {
    const items = [
      user("go"),
      call({ action: "open", url: "https://shop.example.com/cart" }),
      result("opened"),
      call(handoff()),
      call({ command: "ls" }, "bash"),
      result("ERROR handoff_expired: late", true, undefined),
      result("files", false, "bash"),
    ];
    expect(browserHandoffCards(items, true)[0]).toMatchObject({
      anchorIndex: 5,
      url: null,
      site: "shop.example.com",
      state: "expired",
    });
  });

  it("names the site only from the hand-off's own turn", () => {
    const items = [
      user("a"),
      call({ action: "open", url: "https://old.com" }),
      result("ok"),
      end,
      user("b"),
      call(handoff("not a url")),
    ];
    expect(browserHandoffCards(items, true)[0]).toMatchObject({
      url: "not a url",
      site: null,
    });
  });

  it("returns one card per hand-off in a chat", () => {
    const items = [
      user("a"),
      call(handoff("https://a.com"), "browser", "x"),
      result("ERROR handoff_cancelled: closed", true),
      end,
      user("b"),
      call(handoff("https://b.com"), "browser", "y"),
    ];
    expect(
      browserHandoffCards(items, true).map((c) => [c.key, c.site, c.state]),
    ).toEqual([
      ["x:handoff", "a.com", "cancelled"],
      ["y:handoff", "b.com", "waiting"],
    ]);
  });

  it("ignores other browser actions and other tools", () => {
    const items = [
      call({ action: "open", url: "https://a.com" }),
      result("ok"),
      call({ action: "handoff" }, "bash"),
    ];
    expect(browserHandoffCards(items, true)).toEqual([]);
  });
});
