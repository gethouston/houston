import { describe, expect, it } from "vitest";
import {
  CHANNEL_WATCH_MS,
  CHANNEL_WATCH_POLL_MS,
  type ChannelWatches,
  channelWatchActive,
  channelWatchLanded,
  channelWatchPollMs,
  pruneLandedWatches,
  startChannelWatch,
  watchChannel,
} from "./watch";

const now = 1_000_000;
const slack = (id: string) => ({ id, provider: "slack" as const });
const whatsapp = (id: string) => ({ id, provider: "whatsapp" as const });

describe("watching for a connection made outside this tab", () => {
  it("polls nothing when no hand-off is outstanding", () => {
    expect(channelWatchActive(undefined, [], now)).toBe(false);
    expect(channelWatchPollMs({}, [], now)).toBe(false);
  });

  it("polls while the connection the user went to make has not arrived", () => {
    const watch = startChannelWatch("slack", [slack("a")], now);
    expect(channelWatchActive(watch, [slack("a")], now)).toBe(true);
    expect(channelWatchPollMs({ slack: watch }, [slack("a")], now)).toBe(
      CHANNEL_WATCH_POLL_MS,
    );
    expect(
      channelWatchActive(watch, [slack("a"), slack("b")], now + 5_000),
    ).toBe(false);
  });

  it("stops rather than polling forever behind an abandoned hand-off", () => {
    const watch = startChannelWatch("slack", [], now);
    expect(channelWatchActive(watch, [], now + CHANNEL_WATCH_MS - 1)).toBe(
      true,
    );
    expect(channelWatchActive(watch, [], now + CHANNEL_WATCH_MS)).toBe(false);
  });

  it("counts only its own provider's connections", () => {
    const watch = startChannelWatch("whatsapp", [slack("a")], now);
    // A Slack connection landing is not the WhatsApp hand-off landing.
    const others = [slack("a"), slack("b")];
    expect(channelWatchActive(watch, others, now)).toBe(true);
    expect(channelWatchLanded(watch, others)).toBe(false);
    const landed = [...others, whatsapp("c")];
    expect(channelWatchActive(watch, landed, now)).toBe(false);
    expect(channelWatchLanded(watch, landed)).toBe(true);
  });

  it("lands on a NEW connection even after an old one was disconnected", () => {
    // Counting would miss this: one gone and one new leaves the count as it was.
    const watch = startChannelWatch("whatsapp", [whatsapp("old")], now);
    expect(channelWatchLanded(watch, [])).toBe(false);
    expect(channelWatchActive(watch, [], now)).toBe(true);
    expect(channelWatchLanded(watch, [whatsapp("new")])).toBe(true);
  });

  it("keeps watching until a code that outlives the default window expires", () => {
    // A WhatsApp code lives ten minutes and is scanned on ANOTHER device, so
    // this window never regains focus: the watch has to cover the whole code.
    const expiresAt = new Date(now + 10 * 60_000).toISOString();
    const watch = startChannelWatch("whatsapp", [], now, expiresAt);
    expect(channelWatchActive(watch, [], now + 9 * 60_000)).toBe(true);
    expect(channelWatchActive(watch, [], now + 10 * 60_000)).toBe(false);
  });

  it("never shortens the default window for a code that expires sooner", () => {
    const expiresAt = new Date(now + 60_000).toISOString();
    const watch = startChannelWatch("whatsapp", [], now, expiresAt);
    expect(channelWatchActive(watch, [], now + CHANNEL_WATCH_MS - 1)).toBe(
      true,
    );
  });

  it("falls back to the default window when the expiry does not parse", () => {
    const watch = startChannelWatch("whatsapp", [], now, "not a date");
    expect(watch.until).toBe(now + CHANNEL_WATCH_MS);
  });

  it("polls while ANY provider's watch is outstanding", () => {
    const watches: ChannelWatches = {
      slack: startChannelWatch("slack", [], now),
      whatsapp: startChannelWatch("whatsapp", [], now),
    };
    const list = [slack("a")];
    expect(channelWatchPollMs(watches, list, now)).toBe(CHANNEL_WATCH_POLL_MS);
    expect(channelWatchPollMs({ slack: watches.slack }, list, now)).toBe(false);
  });

  it("is not landed while nothing is watched", () => {
    expect(channelWatchLanded(undefined, [whatsapp("a")])).toBe(false);
  });
});

describe("the per-provider watch record", () => {
  it("starting one provider's watch leaves the other's clock alone", () => {
    const first = watchChannel({}, "whatsapp", [], now);
    const both = watchChannel(first, "slack", [], now + 60_000);
    expect(both.whatsapp).toBe(first.whatsapp);
    expect(both.slack?.until).toBe(now + 60_000 + CHANNEL_WATCH_MS);
  });

  it("restarting a provider's watch replaces it", () => {
    const expiresAt = new Date(now + 10 * 60_000).toISOString();
    const first = watchChannel({}, "whatsapp", [], now);
    const again = watchChannel(first, "whatsapp", [], now, expiresAt);
    expect(again.whatsapp?.until).toBe(now + 10 * 60_000);
  });

  it("ends exactly the watches whose connection landed, and names them", () => {
    const watches = watchChannel(
      watchChannel({}, "slack", [], now),
      "whatsapp",
      [],
      now,
    );
    const pruned = pruneLandedWatches(watches, [whatsapp("w")]);
    expect(pruned.landed).toEqual(["whatsapp"]);
    expect(pruned.watches).toEqual({ slack: watches.slack });
  });

  it("returns the same record when nothing landed", () => {
    const watches = watchChannel({}, "slack", [slack("a")], now);
    const pruned = pruneLandedWatches(watches, [slack("a")]);
    expect(pruned.landed).toEqual([]);
    expect(pruned.watches).toBe(watches);
  });
});
