import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { VisibilityDoc } from "../src/lib/perf-span-board.ts";
import { perfSpanEventProps } from "../src/lib/perf-span-mirror.ts";
import {
  type PerfSpanName,
  type PerfSpanObservation,
  PerfSpans,
  type PerfSpanTags,
} from "../src/lib/perf-spans.ts";

function fakeDoc(initial: DocumentVisibilityState = "visible") {
  const listeners: Array<() => void> = [];
  const doc = {
    visibilityState: initial,
    addEventListener(type: string, cb: () => void) {
      if (type === "visibilitychange") listeners.push(cb);
    },
  };
  return {
    doc: doc as unknown as VisibilityDoc,
    set(state: DocumentVisibilityState) {
      doc.visibilityState = state;
      for (const cb of listeners) cb();
    },
  };
}

function harness(initial: DocumentVisibilityState = "visible") {
  let now = 0;
  const page = fakeDoc(initial);
  const sent: PerfSpanObservation[][] = [];
  const mirrored: Array<{
    span: PerfSpanName;
    ms: number;
    tags: PerfSpanTags;
  }> = [];
  const spans = new PerfSpans({ t0Ms: 0, now: () => now, doc: page.doc });
  spans.configure({
    async send(batch) {
      sent.push(batch);
    },
    mirror(span, ms, tags) {
      mirrored.push({ span, ms, tags });
    },
  });
  return { spans, sent, mirrored, page, tick: (ms: number) => (now += ms) };
}

async function paintBoard(h: ReturnType<typeof harness>, ms: number) {
  h.tick(ms);
  h.spans.boardRendered();
  await h.spans.flush();
  const props = h.mirrored.map((m) => perfSpanEventProps(m.span, m.ms, m.tags));
  return { shipped: h.sent.flat(), props };
}

describe("PerfSpans app_to_board sinks", () => {
  it("a returning user in a visible tab reaches the gateway and PostHog", async () => {
    const h = harness();
    const { shipped, props } = await paintBoard(h, 5_000);
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 5_000 }]);
    deepStrictEqual(props, [
      {
        span: "app_to_board",
        duration_ms: 5_000,
        first_run: false,
        was_hidden: false,
      },
    ]);
  });

  it("a session that showed the sign-in screen reaches PostHog only", async () => {
    const h = harness();
    h.spans.signInShown();
    const { shipped, props } = await paintBoard(h, 262_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [
      {
        span: "app_to_board",
        duration_ms: 262_000,
        first_run: true,
        was_hidden: false,
      },
    ]);
  });

  it("a tab hidden before the board painted reaches PostHog only", async () => {
    const h = harness();
    h.tick(1_000);
    h.page.set("hidden");
    h.tick(30_000);
    h.page.set("visible");
    const { shipped, props } = await paintBoard(h, 1_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [
      {
        span: "app_to_board",
        duration_ms: 32_000,
        first_run: false,
        was_hidden: true,
      },
    ]);
  });

  it("a tab that opened hidden counts as hidden", async () => {
    const h = harness("hidden");
    const { shipped, props } = await paintBoard(h, 9_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props[0]?.was_hidden, true);
  });

  it("sign-in and a hidden tab together reach PostHog only, with both tags", async () => {
    const h = harness();
    h.spans.signInShown();
    h.page.set("hidden");
    const { shipped, props } = await paintBoard(h, 2_600_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [
      {
        span: "app_to_board",
        duration_ms: 2_600_000,
        first_run: true,
        was_hidden: true,
      },
    ]);
  });

  it("hiding the tab after the board painted changes nothing", async () => {
    const h = harness();
    const { shipped } = await paintBoard(h, 4_000);
    h.page.set("hidden");
    h.spans.signInShown();
    h.spans.boardRendered();
    await h.spans.flush();
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 4_000 }]);
    deepStrictEqual(h.sent.flat(), [{ span: "app_to_board", ms: 4_000 }]);
    deepStrictEqual(h.mirrored.length, 1);
  });
});
