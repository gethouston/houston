import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FirstResponse, FirstResponseOutcome } from "@houston/sdk";
import { type PerfSpanObservation, PerfSpans } from "../src/lib/perf-spans.ts";

function harness(startMs = 100_000) {
  let now = startMs;
  const sent: PerfSpanObservation[][] = [];
  const mirrored: Array<{ span: string; ms: number }> = [];
  const mirroredOrgs: Array<{ span: string; orgSlug: string | null }> = [];
  const mirroredOutcomes: Array<{ span: string; outcome?: string }> = [];
  const spans = new PerfSpans({ t0Ms: startMs, now: () => now });
  spans.configure({
    async send(batch) {
      sent.push(batch);
    },
    mirror(span, ms, tags) {
      mirrored.push({ span, ms });
      mirroredOrgs.push({ span, orgSlug: tags.orgSlug });
      mirroredOutcomes.push({ span, outcome: tags.outcome });
    },
  });
  spans.landedOn("board");
  return {
    spans,
    sent,
    mirrored,
    mirroredOrgs,
    mirroredOutcomes,
    now: () => now,
    tick: (ms: number) => (now += ms),
  };
}

/**
 * The first response the SDK reports for a turn sent at `sentAt` that resolved
 * (`outcome`) at `at` — the only input the send spans pair on.
 */
function response(
  sentAt: number,
  at: number,
  outcome: FirstResponseOutcome = "first_text",
): FirstResponse {
  return { outcome, sentAt, at };
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

  it("every turn's first text yields its own send span", async () => {
    const { spans, sent, tick, now } = harness();
    tick(2000);
    const first = now();
    tick(800);
    spans.turnResponded(response(first, now()));
    tick(100);
    const second = now();
    tick(400);
    spans.turnResponded(response(second, now()));
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 800 },
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
    spans.landedOn("board");
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
    spans.landedOn("board");
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

describe("PerfSpans first response", () => {
  it("two concurrent conversations: each turn's span runs from its own send to its own answer", async () => {
    const { spans, sent } = harness(0);
    // A sent at 1s and answered at 9s; B sent at 2s and answered first, at 3s.
    spans.turnResponded(response(2_000, 3_000));
    spans.turnResponded(response(1_000, 9_000));
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 1_000 },
      { span: "send_to_first_response", ms: 8_000 },
    ]);
  });

  it("keeps an answer slower than a minute, in PostHog and the gateway ingest", async () => {
    const { spans, sent, mirrored } = harness(0);
    spans.turnResponded(response(10_000, 105_000));
    await spans.flush();
    deepStrictEqual(sent.flat()[0], {
      span: "send_to_first_response",
      ms: 95_000,
    });
    deepStrictEqual(mirrored[0], {
      span: "send_to_first_response",
      ms: 95_000,
    });
  });

  it("counts a turn that ended without text in PostHog, with its outcome, and keeps it out of the gateway histogram", async () => {
    const { spans, sent, mirrored, mirroredOutcomes } = harness(0);
    spans.turnResponded(response(0, 4_000, "error"));
    spans.turnResponded(response(0, 2_000, "cancelled"));
    spans.turnResponded(response(0, 30_000, "no_text"));
    spans.turnResponded(response(0, 7_000, "interrupted"));
    await spans.flush();
    // A failure is not a time to first text: the TTFT histogram never sees it.
    deepStrictEqual(sent.flat(), []);
    deepStrictEqual(mirrored, [
      { span: "send_to_first_response", ms: 4_000 },
      { span: "send_to_first_response", ms: 2_000 },
      { span: "send_to_first_response", ms: 30_000 },
      { span: "send_to_first_response", ms: 7_000 },
    ]);
    deepStrictEqual(
      mirroredOutcomes.map((m) => m.outcome),
      ["error", "cancelled", "no_text", "interrupted"],
    );
  });

  it("records a timeout as a censored observation in both places", async () => {
    const { spans, sent, mirroredOutcomes } = harness(0);
    spans.turnResponded(response(0, 600_000, "timeout"));
    await spans.flush();
    // A silent timeout censors first activity too (perf-spans-first-activity).
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 600_000 },
      { span: "send_to_first_activity", ms: 600_000 },
    ]);
    deepStrictEqual(mirroredOutcomes, [
      { span: "send_to_first_response", outcome: "timeout" },
      { span: "send_to_first_activity", outcome: "timeout" },
    ]);
  });
});

describe("PerfSpans org slug", () => {
  it("tags a turn's spans with the org it was sent in", () => {
    const { spans, mirroredOrgs, tick, now } = harness();
    spans.setOrgSlug("5f2b225f316c6079");
    tick(10);
    const sentAt = now();
    tick(700);
    spans.turnResponded(response(sentAt, now()));
    deepStrictEqual(mirroredOrgs, [
      { span: "send_to_first_response", orgSlug: "5f2b225f316c6079" },
    ]);
  });

  it("keeps the org a turn was sent in when the space switches before it answers", () => {
    // Paired to its own turn, the reply that lands after the switch IS the
    // reply to the send made in the old space: the old space ran it.
    const { spans, mirroredOrgs, tick, now } = harness();
    spans.setOrgSlug("5f2b225f316c6079");
    tick(10);
    const sentInOld = now();
    tick(100);
    spans.setOrgSlug(null); // capabilities refetch mid-switch
    spans.setOrgSlug("383369a239383fee");
    tick(10);
    const sentInNew = now();
    tick(600);
    spans.turnResponded(response(sentInOld, now()));
    spans.turnResponded(response(sentInNew, now()));
    deepStrictEqual(
      mirroredOrgs
        .filter((m) => m.span === "send_to_first_response")
        .map((m) => m.orgSlug),
      ["5f2b225f316c6079", "383369a239383fee"],
    );
  });

  it("leaves a turn sent before the org was known untagged", () => {
    const { spans, mirroredOrgs, tick, now } = harness();
    const sentAt = now();
    tick(50);
    spans.setOrgSlug("383369a239383fee"); // memberships read after the send
    tick(500);
    spans.turnResponded(response(sentAt, now()));
    deepStrictEqual(
      mirroredOrgs.map((m) => m.orgSlug),
      [null],
    );
  });

  it("never hands the next account's org to an earlier account's turn", () => {
    const { spans, mirroredOrgs, tick, now } = harness();
    spans.setOrgSlug("5f2b225f316c6079");
    tick(10);
    const sentAt = now();
    tick(10);
    spans.setOrgSlug(null); // signed out
    tick(10);
    spans.setOrgSlug("383369a239383fee"); // another account signed in
    tick(700);
    spans.turnResponded(response(sentAt, now()));
    ok(mirroredOrgs.every((m) => m.orgSlug !== "383369a239383fee"));
  });

  it("never ships the org slug or the outcome to the gateway ingest", async () => {
    const { spans, sent, tick, now } = harness();
    spans.setOrgSlug("5f2b225f316c6079");
    tick(10);
    const sentAt = now();
    tick(700);
    spans.turnResponded(response(sentAt, now()));
    await spans.flush();
    // The ingest decodes with DisallowUnknownFields: an extra key 400s the batch.
    deepStrictEqual(sent.flat(), [{ span: "send_to_first_response", ms: 700 }]);
  });

  it("mirrors no org where none is set (desktop, self-host)", () => {
    const { spans, mirroredOrgs, tick, now } = harness();
    const sentAt = now();
    tick(300);
    spans.turnResponded(response(sentAt, now()));
    deepStrictEqual(
      mirroredOrgs.map((m) => m.orgSlug),
      [null],
    );
  });

  it("mirrors no org and no outcome on spans no send pairs", () => {
    const { spans, mirroredOrgs, mirroredOutcomes, tick } = harness();
    spans.setOrgSlug("5f2b225f316c6079");
    tick(5);
    spans.boardRendered();
    deepStrictEqual(mirroredOrgs, [{ span: "app_to_board", orgSlug: null }]);
    deepStrictEqual(mirroredOutcomes, [
      { span: "app_to_board", outcome: undefined },
    ]);
  });
});
