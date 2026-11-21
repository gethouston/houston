import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FirstResponse, FirstResponseOutcome } from "@houston/sdk";
import { type PerfSpanObservation, PerfSpans } from "../src/lib/perf-spans.ts";

function harness() {
  const sent: PerfSpanObservation[][] = [];
  const mirrored: Array<{ span: string; ms: number; outcome?: string }> = [];
  const spans = new PerfSpans({ t0Ms: 0, now: () => 0 });
  spans.configure({
    async send(batch) {
      sent.push(batch);
    },
    mirror(span, ms, tags) {
      mirrored.push({ span, ms, outcome: tags.outcome });
    },
  });
  return { spans, sent, mirrored };
}

function response(
  sentAt: number,
  at: number,
  outcome: FirstResponseOutcome,
  firstActivityAt?: number,
): FirstResponse {
  return {
    outcome,
    sentAt,
    at,
    ...(firstActivityAt === undefined ? {} : { firstActivityAt }),
  };
}

describe("PerfSpans first activity", () => {
  it("ships and mirrors send to first activity next to send to first text", async () => {
    const { spans, sent, mirrored } = harness();
    spans.turnResponded(response(1_000, 21_000, "first_text", 3_000));
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 20_000 },
      { span: "send_to_first_activity", ms: 2_000 },
    ]);
    deepStrictEqual(mirrored, [
      { span: "send_to_first_response", ms: 20_000, outcome: "first_text" },
      { span: "send_to_first_activity", ms: 2_000, outcome: "first_text" },
    ]);
  });

  it("mirrors first activity for every outcome, but ships only the text histogram's outcomes", async () => {
    const { spans, sent, mirrored } = harness();
    spans.turnResponded(response(0, 30_000, "no_text", 4_000));
    spans.turnResponded(response(0, 9_000, "error", 6_000));
    spans.turnResponded(response(0, 8_000, "cancelled", 5_000));
    spans.turnResponded(response(0, 600_000, "timeout", 7_000));
    spans.turnResponded(response(0, 12_000, "first_text", 3_000));
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 600_000 },
      { span: "send_to_first_activity", ms: 7_000 },
      { span: "send_to_first_response", ms: 12_000 },
      { span: "send_to_first_activity", ms: 3_000 },
    ]);
    deepStrictEqual(
      mirrored
        .filter((m) => m.span === "send_to_first_activity")
        .map((m) => [m.outcome, m.ms]),
      [
        ["no_text", 4_000],
        ["error", 6_000],
        ["cancelled", 5_000],
        ["timeout", 7_000],
        ["first_text", 3_000],
      ],
    );
  });

  it("censors a timeout that showed nothing at the deadline, like a text timeout", async () => {
    const { spans, sent } = harness();
    spans.turnResponded(response(0, 600_000, "timeout"));
    await spans.flush();
    deepStrictEqual(sent.flat(), [
      { span: "send_to_first_response", ms: 600_000 },
      { span: "send_to_first_activity", ms: 600_000 },
    ]);
  });

  it("has no first activity for a turn that ended before showing anything", async () => {
    const { spans, mirrored } = harness();
    spans.turnResponded(response(0, 1_000, "error"));
    spans.turnResponded(response(0, 2_000, "cancelled"));
    deepStrictEqual(
      mirrored.map((m) => m.span),
      ["send_to_first_response", "send_to_first_response"],
    );
  });

  it("measures nothing from app start to a reply", async () => {
    const { spans, sent, mirrored } = harness();
    spans.turnResponded(response(60_000, 65_000, "first_text", 62_000));
    await spans.flush();
    deepStrictEqual([...sent.flat(), ...mirrored].map((s) => s.span).sort(), [
      "send_to_first_activity",
      "send_to_first_activity",
      "send_to_first_response",
      "send_to_first_response",
    ]);
  });
});
