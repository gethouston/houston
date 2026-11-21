import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  layout,
  maxScroll,
  mountLog,
  pinnedTop,
  scrollTo,
  settle,
} from "./support/conversation-log-dom.ts";

const { createElement: h } = await import("react");
const { ChatPanel } = await import("../src/chat-panel.tsx");

const feed = [
  { feed_type: "user_message", id: "a", data: "First answer" },
  { feed_type: "user_message", id: "b", data: "Second answer" },
] as const;

const panel = (token: number, placeholder = "") =>
  h(ChatPanel, {
    sessionKey: "scripted",
    feedItems: [...feed],
    isLoading: false,
    status: "ready",
    onSend: async () => {},
    placeholder,
    scrollToLatestToken: token,
    composerOverrideMode: "replace",
    composerOverride: h("div", null, "the step in hand"),
  });

describe("ChatPanel scrollToLatestToken", () => {
  beforeEach(() => {
    layout.viewport = 400;
    layout.scrollTop = maxScroll();
  });

  it("brings a scrolled-up reader to the latest line when it changes", async () => {
    const { pane, render } = mountLog(panel(0));
    scrollTo(pane, maxScroll());
    scrollTo(pane, 100);
    await settle();
    render(panel(1));
    await settle();
    assert.equal(layout.scrollTop, pinnedTop());
  });

  it("leaves a scrolled-up reader in place when the token holds", async () => {
    const { pane, render } = mountLog(panel(0));
    scrollTo(pane, maxScroll());
    scrollTo(pane, 100);
    await settle();
    render(panel(0, "re-rendered"));
    await settle();
    assert.equal(layout.scrollTop, 100);
  });
});
