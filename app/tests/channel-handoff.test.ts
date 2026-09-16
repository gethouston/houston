import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CHANNEL_WATCH_MS,
  channelWatchActive,
  slackHandoff,
  startChannelWatch,
} from "../src/lib/channel-handoff.ts";

const url = "https://slack.com/oauth/v2/authorize?state=abc";

describe("the browser hand-off a connect starts", () => {
  it("says nothing until a connect has run", () => {
    deepStrictEqual(slackHandoff(undefined, undefined), { kind: "idle" });
  });
  it("claims the page is open only when the browser actually opened it", () => {
    deepStrictEqual(slackHandoff({ url, opened: true }, undefined), {
      kind: "open",
    });
  });
  it("offers the page to open when the browser refused", () => {
    deepStrictEqual(slackHandoff({ url, opened: false }, undefined), {
      kind: "blocked",
      url,
    });
  });
  it("clears the refusal once the user opened it themselves", () => {
    deepStrictEqual(slackHandoff({ url, opened: false }, true), {
      kind: "open",
    });
    deepStrictEqual(slackHandoff({ url, opened: false }, false), {
      kind: "blocked",
      url,
    });
  });
});

describe("watching for a connection made outside this tab", () => {
  const now = 1_000_000;
  it("polls nothing when no hand-off is outstanding", () => {
    strictEqual(channelWatchActive(null, 0, now), false);
  });
  it("polls while the connection the user went to make has not arrived", () => {
    const watch = startChannelWatch(1, now);
    strictEqual(channelWatchActive(watch, 1, now), true);
    strictEqual(channelWatchActive(watch, 2, now + 5_000), false);
  });
  it("stops rather than polling forever behind an abandoned hand-off", () => {
    const watch = startChannelWatch(0, now);
    strictEqual(channelWatchActive(watch, 0, now + CHANNEL_WATCH_MS - 1), true);
    strictEqual(channelWatchActive(watch, 0, now + CHANNEL_WATCH_MS), false);
  });
});
