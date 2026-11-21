import {
  BROWSER_LIVE_FRAME_WINDOW,
  type BrowserLiveEvent,
} from "@houston/wire-types";
import type { Page } from "playwright-core";
import { expect, test } from "vitest";
import { LiveInput } from "./input";
import { FakeCdp, fakePage, fakeTab } from "./live.test-support";
import { HandoffSession } from "./session";

async function until(probe: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !probe(); i += 1)
    await new Promise((r) => setTimeout(r, 5));
  if (!probe()) throw new Error("timed out waiting");
}

function handOver(cdp = new FakeCdp(), pages = [fakePage()]) {
  const { tab, sessions } = fakeTab(pages, () => cdp);
  const session = new HandoffSession({
    conversationId: "chat",
    text: "Sign in",
    tab,
    limitMs: 60_000,
  });
  return { session, sessions, cdp, tab };
}

const text = (value: string) => ({ type: "text" as const, text: value });

test("finishing stops a running batch at its next event and drops the batches queued behind it", async () => {
  const { session, sessions, cdp } = handOver();
  const release = cdp.hold("Input.insertText");
  const first = session.apply([text("a"), text("b")]);
  const queued = session.apply([text("c")]);
  await until(() => sessions.length === 1);
  session.finish("done");
  release();
  expect(await first).toEqual({});
  expect(await queued).toEqual({});
  expect(cdp.sent).toEqual(["Input.insertText:a"]);
  expect(sessions).toHaveLength(1);
  await until(() => cdp.detached);
});

test("input queued before a finish never opens a CDP session after it", async () => {
  const { session, sessions } = handOver();
  const queued = session.apply([text("late")]);
  session.finish("cancelled");
  expect(await queued).toEqual({});
  expect(sessions).toHaveLength(0);
});

test("a batch is applied once per viewer and seq, however often it is retried", async () => {
  const { session, cdp } = handOver();
  const viewer = "viewer-0001";
  await session.apply([text("a")], { viewer, seq: 1 });
  await session.apply([text("a")], { viewer, seq: 1 });
  await session.apply([text("b")], { viewer, seq: 2 });
  await session.apply([text("old")], { viewer, seq: 1 });
  await session.apply([text("x")], { viewer: "viewer-0002", seq: 1 });
  await session.apply([text("plain")]);
  expect(cdp.sent).toEqual([
    "Input.insertText:a",
    "Input.insertText:b",
    "Input.insertText:x",
    "Input.insertText:plain",
  ]);
});

test("a retry queued behind its original is not applied a second time", async () => {
  const { session, cdp } = handOver();
  const release = cdp.hold("Input.insertText");
  const batch = { viewer: "viewer-0001", seq: 1 };
  const original = session.apply([text("a")], batch);
  const retry = session.apply([text("a")], batch);
  release();
  await Promise.all([original, retry]);
  expect(cdp.sent).toEqual(["Input.insertText:a"]);
});

test("a hung renderer fails one step in time, and the next batch still runs", async () => {
  const cdp = new FakeCdp();
  const { tab } = fakeTab(undefined, () => cdp);
  const input = new LiveInput(tab, 50);
  cdp.hold("Input.dispatchKeyEvent");
  await expect(input.apply([{ type: "key", key: "Enter" }])).rejects.toThrow(
    /took over 50 ms/,
  );
  await input.apply([text("ok")]);
  expect(cdp.sent).toEqual(["Input.insertText:ok"]);
});

test("Back asks the browser for the history: a popup with none closes, a page with some goes back", async () => {
  const popup = fakePage();
  const opener = fakePage();
  const cdp = new FakeCdp();
  const { tab } = fakeTab([popup, opener], () => cdp);
  const input = new LiveInput(tab, 50);
  cdp.history = { currentIndex: 1, entries: [{}, {}] };
  await input.apply([{ type: "back" }]);
  expect(popup.state).toMatchObject({ closed: false, wentBack: 1 });
  cdp.history = { currentIndex: 0, entries: [{}] };
  await input.apply([{ type: "back" }]);
  expect(popup.state.closed).toBe(true);
  expect(opener.state.closed).toBe(false);
  expect(cdp.sent).toEqual([
    "Page.getNavigationHistory",
    "Page.getNavigationHistory",
  ]);
});

test("Back on a page whose history lookup hangs fails in time", async () => {
  const cdp = new FakeCdp();
  const { tab } = fakeTab(undefined, () => cdp);
  cdp.hold("Page.getNavigationHistory");
  await expect(
    new LiveInput(tab, 50).apply([{ type: "back" }]),
  ).rejects.toThrow(/took over 50 ms/);
});

test("the live view never shows a password the page put in its address", async () => {
  const page = fakePage("https://site.test/login?user=a&password=Secret1");
  const { session, cdp } = handOver(new FakeCdp(), [page]);
  const seen: BrowserLiveEvent[] = [];
  session.attachViewer("viewer-0001", "desktop", (e) => seen.push(e) > 0);
  await until(() => cdp.sent.includes("Page.startScreencast"));
  expect(seen.find((e) => e.type === "page")).toMatchObject({
    url: "https://site.test/login?user=a&password=[hidden]",
  });
  session.finish("done");
});

test("a viewer's frame window carries across a page switch; the old page's late frames are dropped", async () => {
  const first = fakePage("https://site.test/login");
  const popup = fakePage("https://accounts.test/sign-in");
  const sessions: FakeCdp[] = [];
  const { tab } = fakeTab([first, popup], () => {
    const cdp = new FakeCdp();
    sessions.push(cdp);
    return cdp;
  });
  const session = new HandoffSession({
    conversationId: "chat",
    text: "Sign in",
    tab,
    limitMs: 60_000,
  });
  const seen: BrowserLiveEvent[] = [];
  session.attachViewer("viewer-0001", "desktop", (e) => seen.push(e) > 0);
  const frames = () =>
    seen.flatMap((e) => (e.type === "frame" ? [e.jpeg] : []));
  await until(
    () => sessions[0]?.sent.includes("Page.startScreencast") ?? false,
  );
  sessions[0]?.paint("A");
  tab.page = popup as unknown as Page;
  for (const follow of tab.onPageChange) follow(tab.page);
  await until(
    () => sessions[1]?.sent.includes("Page.startScreencast") ?? false,
  );
  expect(sessions[0]?.detached).toBe(true);
  sessions[0]?.paint("OLD");
  const fill = Array.from(
    { length: BROWSER_LIVE_FRAME_WINDOW - 1 },
    (_, i) => `B${i + 1}`,
  );
  for (const jpeg of [...fill, "C"]) sessions[1]?.paint(jpeg);
  expect(frames()).toEqual(["A", ...fill]);
  expect(seen.filter((e) => e.type === "page").at(-1)).toMatchObject({
    url: "https://accounts.test/sign-in",
  });
  session.ack("viewer-0001", BROWSER_LIVE_FRAME_WINDOW);
  expect(frames()).toEqual(["A", ...fill, "C"]);
  session.finish("done");
});
