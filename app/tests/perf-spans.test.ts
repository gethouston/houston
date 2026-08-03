import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { type PerfSpanObservation, PerfSpans } from "../src/lib/perf-spans.ts";

function harness(startMs = 100_000) {
  let now = startMs;
  const sent: PerfSpanObservation[][] = [];
  const mirrored: Array<{ span: string; ms: number }> = [];
  const spans = new PerfSpans({ t0Ms: startMs, now: () => now });
  spans.configure({
    async send(batch) {
      sent.push(batch);
    },
    mirror(span, ms) {
      mirrored.push({ span, ms });
    },
  });
  return { spans, sent, mirrored, tick: (ms: number) => (now += ms) };
}

describe("PerfSpans", () => {
  it("measures app_to_board from T0, once per session", async () => {
    const { spans, sent, tick } = harness();
    tick(1500);
    spans.boardRendered();
    tick(50);
    spans.boardRendered(); // agent switch — must not double-report
    await spans.flush();
    deepStrictEqual(sent.flat(), [{ span: "app_to_board", ms: 1500 }]);
  });

  it("pairs card click with the next chat paint", async () => {
    const { spans, sent, tick } = harness();
    spans.chatRendered(); // paint with no armed click — ignored
    spans.cardClicked();
    tick(320);
    spans.chatRendered();
    spans.chatRendered(); // second paint — mark already consumed
    await spans.flush();
    deepStrictEqual(sent.flat(), [{ span: "card_click_to_chat", ms: 320 }]);
  });

  it("send → first output yields both send span and once-only journey span", async () => {
    const { spans, sent, tick } = harness();
    spans.firstAssistantOutput(); // routine/teammate output with no send — ignored
    tick(2000);
    spans.messageSent();
    tick(800);
    spans.firstAssistantOutput();
    spans.firstAssistantOutput(); // streaming continues — no re-report
    tick(100);
    spans.messageSent();
    tick(400);
    spans.firstAssistantOutput();
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 800 },
      { span: "app_to_first_response", ms: 2800 },
      { span: "send_to_first_response", ms: 400 },
    ]);
  });

  it("expires stale marks instead of reporting minutes-long spans", async () => {
    const { spans, sent, tick } = harness();
    spans.cardClicked();
    tick(61_000);
    spans.chatRendered();
    await spans.flush();
    strictEqual(sent.flat().length, 0);
  });

  it("re-queues a failed batch once, then drops it", async () => {
    let now = 0;
    let failures = 0;
    const sent: PerfSpanObservation[][] = [];
    const spans = new PerfSpans({ t0Ms: 0, now: () => now });
    spans.configure({
      async send(batch) {
        if (failures++ === 0) throw new Error("offline");
        sent.push(batch);
      },
    });
    now = 10;
    spans.boardRendered();
    await spans.flush(); // fails → re-queued
    await spans.flush(); // succeeds
    deepStrictEqual(sent.flat(), [{ span: "app_to_board", ms: 10 }]);
  });

  it("holds a batch across repeated failures until the transport recovers", async () => {
    // The session-not-ready case: send() throws until the token loads, and
    // the earliest spans (app_to_board) must survive to the eventual flush.
    let now = 0;
    let ready = false;
    const sent: PerfSpanObservation[][] = [];
    const spans = new PerfSpans({ t0Ms: 0, now: () => now });
    spans.configure({
      async send(batch) {
        if (!ready) throw new Error("session not ready");
        sent.push(batch);
      },
    });
    now = 900;
    spans.boardRendered();
    await spans.flush();
    await spans.flush();
    await spans.flush();
    strictEqual(sent.length, 0);
    ready = true;
    await spans.flush();
    deepStrictEqual(sent.flat(), [{ span: "app_to_board", ms: 900 }]);
  });

  it("only moves T0 earlier", async () => {
    const { spans, sent, tick } = harness(100_000);
    spans.setLaunchT0(150_000); // late bogus stamp — ignored
    spans.setLaunchT0(99_000); // shell start before webview — accepted
    tick(1000);
    spans.boardRendered();
    await spans.flush();
    deepStrictEqual(sent.flat(), [{ span: "app_to_board", ms: 2000 }]);
  });

  it("mirrors every observation even before any transport failure handling", async () => {
    const { spans, mirrored, tick } = harness();
    tick(5);
    spans.boardRendered();
    deepStrictEqual(mirrored, [{ span: "app_to_board", ms: 5 }]);
  });
});
