import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingWarmingSend } from "../src/lib/agent-provisioning.ts";
import {
  mergeWarmingRows,
  warmingConversations,
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

const agent = (id: string) => ({
  id,
  folderPath: `/w/${id}`,
  name: id.toUpperCase(),
});

/** One agent ("kai") warming with the given queued sends — the shape the store
 *  hands `warmingConversations`. */
const kaiWarming = (...pendingSends: PendingWarmingSend[]) =>
  warmingConversations([agent("kai")], {
    kai: { since: SINCE, pendingSends },
  });

describe("mergeWarmingRows", () => {
  const optimistic = kaiWarming(send());

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

/**
 * The CROSS-AGENT overlay. Agents lost their own boards in the teams cutover,
 * so a mission started against a still-cold engine has only the team's board
 * (or the global one) to appear on — and that board reads the conversation
 * sweep, which is exactly the read the cold start is holding.
 */
describe("warmingConversations", () => {
  it("stamps each queued row with its owning agent, as a running activity row", () => {
    deepStrictEqual(
      warmingConversations([agent("kai"), agent("ada")], {
        kai: {
          since: SINCE,
          pendingSends: [send({ queuedAt: SINCE + 5_000 })],
        },
      }),
      [
        {
          id: "a1",
          title: "Book a flight to Tokyo",
          description: "book a flight to Tokyo",
          status: "running",
          type: "activity",
          session_key: "activity-a1",
          updated_at: new Date(SINCE + 5_000).toISOString(),
          agent_path: "/w/kai",
          agent_name: "KAI",
        },
      ],
    );
  });

  it("anchors rows without a queue timestamp to the entry's since", () => {
    // A relaunch restored a mirror written before `queuedAt` existed.
    const [row] = kaiWarming(send());
    strictEqual(row.updated_at, new Date(SINCE).toISOString());
  });

  it("skips follow-up sends (no board row of their own)", () => {
    deepStrictEqual(kaiWarming(send({ id: "s2", row: undefined })), []);
    deepStrictEqual(kaiWarming(), []);
  });

  it("renders the status a queued row settled to (welcome → needs_you)", () => {
    const welcome = send({
      rowOnly: true,
      row: {
        id: "w1",
        title: "Meet Maya",
        description: "",
        status: "needs_you",
      },
    });
    const [row] = kaiWarming(welcome);
    strictEqual(row.status, "needs_you");
  });

  it("carries the row's agent mode, and omits it when the send carried none", () => {
    const [pinned] = kaiWarming(
      send({
        row: { id: "a2", title: "T", description: "d", agent: "researcher" },
      }),
    );
    strictEqual(pinned.agent, "researcher");
    const [plain] = kaiWarming(send());
    strictEqual("agent" in plain, false);
  });

  it("is empty when nothing is provisioning, so the merge is the identity", () => {
    const rows = warmingConversations([agent("kai")], {});
    strictEqual(rows.length, 0);
    strictEqual(mergeWarmingRows(undefined, rows), undefined);
  });

  it("lets the real row win by id once the sweep returns it", () => {
    const warming = kaiWarming(send({ queuedAt: SINCE }));
    const fetched = [{ id: "a1", title: "server truth" }];
    deepStrictEqual(mergeWarmingRows(fetched, warming as typeof fetched), [
      { id: "a1", title: "server truth" },
    ]);
  });
});
