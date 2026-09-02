import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { reserveBrowserTab, type TabHandle } from "../src/lib/browser-tab.ts";

function fakeTab() {
  const log: string[] = [];
  const tab: TabHandle & { hrefs: string[] } = {
    closed: false,
    opener: { some: "window" },
    hrefs: [],
    location: {
      set href(value: string) {
        tab.hrefs.push(value);
      },
      get href() {
        return tab.hrefs.at(-1) ?? "";
      },
    },
    close: () => {
      log.push("close");
      tab.closed = true;
    },
  };
  return { tab, log };
}

describe("reserveBrowserTab", () => {
  it("claims the tab, disowns its opener, and navigates it later", () => {
    const { tab } = fakeTab();
    const reserved = reserveBrowserTab(() => tab);
    strictEqual(reserved !== null, true);
    // The provider page must never be able to reach back into Houston's tab.
    strictEqual(tab.opener, null);
    strictEqual(reserved?.navigate("https://oauth.example/slack"), true);
    deepStrictEqual(tab.hrefs, ["https://oauth.example/slack"]);
  });

  it("is null when the browser refuses even the synchronous open", () => {
    strictEqual(
      reserveBrowserTab(() => null),
      null,
    );
  });

  it("reports a tab the user closed while the link was minting", () => {
    const { tab } = fakeTab();
    const reserved = reserveBrowserTab(() => tab);
    tab.closed = true;
    strictEqual(reserved?.navigate("https://oauth.example/slack"), false);
    deepStrictEqual(tab.hrefs, [], "never navigates a closed tab");
  });

  it("discard closes an empty tab, never a navigated one", () => {
    const empty = fakeTab();
    reserveBrowserTab(() => empty.tab)?.discard();
    deepStrictEqual(empty.log, ["close"]);

    const used = fakeTab();
    const reserved = reserveBrowserTab(() => used.tab);
    reserved?.navigate("https://oauth.example/slack");
    reserved?.discard();
    deepStrictEqual(used.log, [], "the OAuth page stays open");
  });
});
