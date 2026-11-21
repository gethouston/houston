import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { paintedSessionKey } from "../src/lib/perf-span-marks.ts";
import { type PerfSpanObservation, PerfSpans } from "../src/lib/perf-spans.ts";

describe("paintedSessionKey", () => {
  it("is null while no chat is open or its messages have not loaded", () => {
    strictEqual(paintedSessionKey(null, 0), null);
    strictEqual(paintedSessionKey(null, 4), null);
    strictEqual(paintedSessionKey("s-1", 0), null);
  });

  it("names the open chat once it has messages", () => {
    strictEqual(paintedSessionKey("s-1", 3), "s-1");
  });

  it("changes when a second cached chat opens, so the mark fires again", () => {
    const keys = [paintedSessionKey("s-1", 3), paintedSessionKey("s-2", 7)];
    deepStrictEqual(keys, ["s-1", "s-2"]);
  });
});

describe("card click to chat", () => {
  it("each card click pairs with the paint of the chat it opened", async () => {
    let now = 0;
    const sent: PerfSpanObservation[][] = [];
    const spans = new PerfSpans({ t0Ms: 0, now: () => now });
    spans.configure({
      async send(batch) {
        sent.push(batch);
      },
    });
    let lastKey: string | null = null;
    const render = (key: string | null, feedLength: number) => {
      const painted = paintedSessionKey(key, feedLength);
      if (painted !== null && painted !== lastKey) spans.chatRendered();
      lastKey = painted;
    };
    spans.cardClicked();
    now += 200;
    render("s-1", 0);
    now += 150;
    render("s-1", 5);
    render("s-1", 6);
    spans.cardClicked();
    now += 40;
    render("s-2", 9);
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "card_click_to_chat", ms: 350 },
      { span: "card_click_to_chat", ms: 40 },
    ]);
  });
});
