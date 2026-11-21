import {
  BROWSER_LIVE_FRAME_WINDOW,
  BROWSER_LIVE_FRAME_WINDOW_BYTES,
  type BrowserLiveEvent,
  type BrowserLiveFrame,
} from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { ViewerWindow } from "./viewer-window";

const frame = (seq: number, bytes = 10): BrowserLiveFrame => ({
  type: "frame",
  seq,
  jpeg: "A".repeat(bytes),
  width: 1,
  height: 1,
});

function viewer() {
  const sent: number[] = [];
  const window = new ViewerWindow((event: BrowserLiveEvent) => {
    if (event.type === "frame") sent.push(event.seq);
    return true;
  });
  return { window, sent };
}

describe("a viewer's frame window", () => {
  it("holds the newest frame once the count is reached", () => {
    const { window, sent } = viewer();
    const count = BROWSER_LIVE_FRAME_WINDOW;
    for (let seq = 1; seq <= count + 2; seq++) window.frame(frame(seq));
    expect(sent).toHaveLength(count);
    window.ack(count);
    expect(sent.at(-1)).toBe(count + 2);
    expect(sent).not.toContain(count + 1);
  });

  it("holds a frame that would take the unacked bytes past the cap", () => {
    const { window, sent } = viewer();
    const big = Math.floor(BROWSER_LIVE_FRAME_WINDOW_BYTES / 3);
    for (let seq = 1; seq <= 4; seq++) window.frame(frame(seq, big));
    expect(sent).toEqual([1, 2, 3]);
    window.ack(1);
    expect(sent).toEqual([1, 2, 3, 4]);
  });

  it("still sends one frame larger than the cap when nothing is unacked", () => {
    const { window, sent } = viewer();
    const huge = BROWSER_LIVE_FRAME_WINDOW_BYTES + 1;
    window.frame(frame(1, huge));
    window.frame(frame(2, huge));
    expect(sent).toEqual([1]);
    window.ack(1);
    expect(sent).toEqual([1, 2]);
  });

  it("a replayed latest frame never holds back the next one", () => {
    const { window, sent } = viewer();
    const big = Math.floor(BROWSER_LIVE_FRAME_WINDOW_BYTES * 0.6);
    window.replay(frame(7, big));
    window.frame(frame(8, big));
    expect(sent).toEqual([7, 8]);
  });

  it("does not count a frame the socket refused", () => {
    const sent: number[] = [];
    let open = false;
    const window = new ViewerWindow((event) => {
      if (event.type === "frame" && open) sent.push(event.seq);
      return open;
    });
    window.frame(frame(1, BROWSER_LIVE_FRAME_WINDOW_BYTES));
    open = true;
    window.frame(frame(2, BROWSER_LIVE_FRAME_WINDOW_BYTES));
    expect(sent).toEqual([2]);
  });
});
