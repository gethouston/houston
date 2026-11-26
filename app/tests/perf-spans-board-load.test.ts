import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { perfSpanEventProps } from "../src/lib/perf-span-mirror.ts";
import type {
  VisibilityDoc,
  VisibilityTimeline,
} from "../src/lib/perf-span-visibility.ts";
import {
  type PerfSpanName,
  type PerfSpanObservation,
  PerfSpans,
  type PerfSpanTags,
} from "../src/lib/perf-spans.ts";

function fakeDoc(initial: DocumentVisibilityState = "visible") {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: initial,
    addEventListener(type: string, cb: () => void) {
      if (type === "visibilitychange") listeners.add(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      if (type === "visibilitychange") listeners.delete(cb);
    },
  };
  return {
    doc: doc as unknown as VisibilityDoc,
    listeners,
    set(state: DocumentVisibilityState) {
      doc.visibilityState = state;
      for (const cb of listeners) cb();
    },
  };
}

function harness(opts?: {
  initial?: DocumentVisibilityState;
  timeline?: VisibilityTimeline;
  landing?: string | null;
}) {
  let now = 0;
  const page = fakeDoc(opts?.initial);
  const sent: PerfSpanObservation[][] = [];
  const mirrored: Array<{
    span: PerfSpanName;
    ms: number;
    tags: PerfSpanTags;
  }> = [];
  const spans = new PerfSpans({
    t0Ms: 0,
    now: () => now,
    doc: page.doc,
    timeline: opts?.timeline ?? { timeOrigin: 0 },
  });
  spans.configure({
    async send(batch) {
      sent.push(batch);
    },
    mirror(span, ms, tags) {
      mirrored.push({ span, ms, tags });
    },
  });
  const landing = opts?.landing === undefined ? "board" : opts.landing;
  if (landing !== null) spans.landedOn(landing);
  return { spans, sent, mirrored, page, tick: (ms: number) => (now += ms) };
}

async function paintBoard(h: ReturnType<typeof harness>, ms: number) {
  h.tick(ms);
  h.spans.boardRendered();
  await h.spans.flush();
  const props = h.mirrored.map((m) => perfSpanEventProps(m.span, m.ms, m.tags));
  return { shipped: h.sent.flat(), props };
}

const load = (duration_ms: number, extra: Record<string, unknown> = {}) => ({
  span: "app_to_board",
  duration_ms,
  sign_in_shown: false,
  onboarding_shown: false,
  hidden_ms: 0,
  opened_hidden: false,
  landing: "board",
  ...extra,
});

describe("PerfSpans app_to_board sinks", () => {
  it("a returning user who lands on the board reaches the gateway and PostHog", async () => {
    const h = harness();
    const { shipped, props } = await paintBoard(h, 5_000);
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 5_000 }]);
    deepStrictEqual(props, [load(5_000)]);
  });

  it("a session that showed the sign-in screen reaches PostHog only", async () => {
    const h = harness();
    h.spans.signInShown();
    const { shipped, props } = await paintBoard(h, 262_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [load(262_000, { sign_in_shown: true })]);
  });

  it("an onboarding resumed after a restart reaches PostHog only", async () => {
    // No sign-in screen: the restored session goes straight to the onboarding.
    const h = harness({ landing: "assistant" });
    h.spans.onboardingShown();
    const { shipped, props } = await paintBoard(h, 400_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [
      load(400_000, { onboarding_shown: true, landing: "assistant" }),
    ]);
  });

  it("a page hidden for a while mid-boot ships its active time", async () => {
    const h = harness();
    h.tick(1_000);
    h.page.set("hidden");
    h.tick(30_000);
    h.page.set("visible");
    const { shipped, props } = await paintBoard(h, 1_000);
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 2_000 }]);
    deepStrictEqual(props, [load(32_000, { hidden_ms: 30_000 })]);
  });

  it("a page still hidden at paint counts the open interval", async () => {
    const h = harness();
    h.tick(2_000);
    h.page.set("hidden");
    const { shipped, props } = await paintBoard(h, 5_000);
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 2_000 }]);
    deepStrictEqual(props[0]?.hidden_ms, 5_000);
  });

  it("a page that opened hidden reaches PostHog only", async () => {
    const h = harness({ initial: "hidden" });
    h.tick(4_000);
    h.page.set("visible");
    const { shipped, props } = await paintBoard(h, 1_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [
      load(5_000, { hidden_ms: 4_000, opened_hidden: true }),
    ]);
  });

  it("replays visibility changes from before the module loaded", async () => {
    // Chunk loaded at 10 s; the page went hidden at 1 s and back at 7 s.
    const h = harness({
      timeline: {
        timeOrigin: 0,
        getEntriesByType: (type) =>
          type === "visibility-state"
            ? [
                { name: "visible", startTime: 0 },
                { name: "hidden", startTime: 1_000 },
                { name: "visible", startTime: 7_000 },
              ]
            : [],
      },
    });
    const { shipped, props } = await paintBoard(h, 10_000);
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 4_000 }]);
    deepStrictEqual(props, [load(10_000, { hidden_ms: 6_000 })]);
  });

  it("an entry replay that starts hidden marks the page opened hidden", async () => {
    const h = harness({
      timeline: {
        timeOrigin: 0,
        getEntriesByType: () => [
          { name: "hidden", startTime: 0 },
          { name: "visible", startTime: 3_000 },
        ],
      },
    });
    const { shipped, props } = await paintBoard(h, 8_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props[0]?.opened_hidden, true);
    deepStrictEqual(props[0]?.hidden_ms, 3_000);
  });

  it("a launch that landed elsewhere reaches PostHog only, with the landing", async () => {
    // The phone opens on its Agents list; the first board is a later visit.
    const h = harness({ landing: "agents-home" });
    const { shipped, props } = await paintBoard(h, 45_000);
    deepStrictEqual(shipped, []);
    deepStrictEqual(props, [load(45_000, { landing: "agents-home" })]);
  });

  it("only the first landing counts", async () => {
    const h = harness({ landing: "agents-home" });
    h.spans.landedOn("board");
    const { shipped } = await paintBoard(h, 3_000);
    deepStrictEqual(shipped, []);
  });

  it("no landing reported keeps the span off the gateway, untagged", async () => {
    const h = harness({ landing: null });
    const { shipped, props } = await paintBoard(h, 3_000);
    deepStrictEqual(shipped, []);
    const { landing: _landing, ...rest } = load(3_000);
    deepStrictEqual(props, [rest]);
  });

  it("stops listening for visibility once the board painted", async () => {
    const h = harness();
    deepStrictEqual(h.page.listeners.size, 1);
    const { shipped } = await paintBoard(h, 4_000);
    deepStrictEqual(h.page.listeners.size, 0);
    h.page.set("hidden");
    h.spans.signInShown();
    h.spans.boardRendered();
    await h.spans.flush();
    deepStrictEqual(shipped, [{ span: "app_to_board", ms: 4_000 }]);
    deepStrictEqual(h.sent.flat(), [{ span: "app_to_board", ms: 4_000 }]);
    deepStrictEqual(h.mirrored.length, 1);
  });
});
