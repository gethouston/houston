import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingWarmingSend } from "../src/lib/agent-provisioning.ts";
import {
  mergeWarmingRows,
  warmingBoardRows,
} from "../src/lib/warming-board-rows.ts";

const SINCE = 1_700_000_000_000;

const send = (over: Partial<PendingWarmingSend> = {}): PendingWarmingSend => ({
  id: "s1",
  sessionKey: "activity-a1",
  text: "book a flight to Tokyo",
  row: {
    id: "a1",
    title: "Book a flight to Tokyo",
    description: "book a flight to Tokyo",
  },
  ...over,
});

describe("warmingBoardRows", () => {
  it("maps a queued first message to a running board row", () => {
    const rows = warmingBoardRows([send({ queuedAt: SINCE + 5_000 })], SINCE);
    deepStrictEqual(rows, [
      {
        id: "a1",
        title: "Book a flight to Tokyo",
        description: "book a flight to Tokyo",
        status: "running",
        session_key: "activity-a1",
        agent: undefined,
        provider: undefined,
        model: undefined,
        updated_at: new Date(SINCE + 5_000).toISOString(),
      },
    ]);
  });

  it("anchors rows without a queue timestamp to the entry's since", () => {
    const rows = warmingBoardRows([send()], SINCE);
    strictEqual(rows[0].updated_at, new Date(SINCE).toISOString());
  });

  it("skips follow-up sends (no board row of their own)", () => {
    const followUp = send({ id: "s2", row: undefined });
    deepStrictEqual(warmingBoardRows([followUp], SINCE), []);
    deepStrictEqual(warmingBoardRows(undefined, SINCE), []);
  });

  it("carries the row's agent mode and provider/model pins", () => {
    const pinned = send({
      row: {
        id: "a2",
        title: "T",
        description: "d",
        agent: "researcher",
        provider: "openai",
        model: "gpt-5.5",
      },
    });
    const [row] = warmingBoardRows([pinned], SINCE);
    strictEqual(row.agent, "researcher");
    strictEqual(row.provider, "openai");
    strictEqual(row.model, "gpt-5.5");
  });
});

describe("mergeWarmingRows", () => {
  const optimistic = warmingBoardRows([send()], SINCE);

  it("is the identity when nothing is queued", () => {
    strictEqual(mergeWarmingRows(undefined, []), undefined);
    const fetched = [optimistic[0]];
    strictEqual(mergeWarmingRows(fetched, []), fetched);
  });

  it("surfaces queued rows while the list read is still held", () => {
    deepStrictEqual(mergeWarmingRows(undefined, optimistic), optimistic);
  });

  it("lets a landed server row win over its optimistic copy", () => {
    const landed = { ...optimistic[0], status: "needs_you", title: "AI title" };
    const merged = mergeWarmingRows([landed], optimistic);
    deepStrictEqual(merged, [landed]);
  });

  it("keeps unrelated fetched rows alongside the queued ones", () => {
    const other = { ...optimistic[0], id: "b9" };
    const merged = mergeWarmingRows([other], optimistic);
    deepStrictEqual(merged, [other, optimistic[0]]);
  });
});
