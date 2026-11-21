import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  type BoardRows,
  deriveSessionLoading,
  type VmSessionStatus,
} from "../src/components/board/session-loading.ts";

const NO_BOARD: BoardRows = { present: false };
const board = (rows: Record<string, string>): BoardRows => ({
  present: true,
  statusBySession: new Map(Object.entries(rows)),
});
const vm =
  (statuses: Record<string, Exclude<VmSessionStatus, undefined>>) =>
  (key: string): VmSessionStatus =>
    statuses[key];

describe("a chat with no board settles from the conversation VM", () => {
  it("clears the spinner when the turn we started completes", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { assistant: true },
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({ assistant: "completed" }),
      }),
      {},
    );
  });

  it("clears the spinner when the server confirms the conversation is idle", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { assistant: true },
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({ assistant: "idle" }),
      }),
      {},
    );
  });

  it("clears the spinner when the turn errors", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { assistant: true },
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({ assistant: "error" }),
      }),
      {},
    );
  });

  it("keeps the spinner on while the turn runs", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { assistant: true },
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({ assistant: "running" }),
      }),
      { assistant: true },
    );
  });

  it("keeps the spinner on until the VM publishes anything for the send", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { assistant: true },
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({}),
      }),
      { assistant: true },
    );
  });

  it("follows a turn this surface never sent", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: {},
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({ assistant: "running" }),
      }),
      { assistant: true },
    );
  });
});

describe("a board keeps its activity-row semantics", () => {
  it("stays busy while the row runs, even after the VM idles", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { s1: true },
        rows: board({ s1: "running" }),
        openSessionKey: "s1",
        vmStatus: vm({ s1: "idle" }),
      }),
      { s1: true },
    );
  });

  it("stays busy for a running row nobody here sent", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: {},
        rows: board({ s1: "running" }),
        openSessionKey: null,
        vmStatus: vm({}),
      }),
      { s1: true },
    );
  });

  it("clears once the row settles and the VM says nothing", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { s1: true },
        rows: board({ s1: "needs_you" }),
        openSessionKey: "s1",
        vmStatus: vm({ s1: "idle" }),
      }),
      {},
    );
  });

  it("keeps a just-created mission busy until its row lands", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { s1: true },
        rows: board({}),
        openSessionKey: null,
        vmStatus: vm({}),
      }),
      { s1: true },
    );
  });

  it("keeps a running row busy even after its VM settled", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { s1: true },
        rows: board({ s1: "running" }),
        openSessionKey: "s1",
        vmStatus: vm({ s1: "completed" }),
      }),
      { s1: true },
    );
  });

  it("shows an external turn in the open session while its VM still says completed", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: {},
        rows: board({ s1: "running" }),
        openSessionKey: "s1",
        vmStatus: vm({ s1: "completed" }),
      }),
      { s1: true },
    );
  });
});

describe("a turn whose reply completed ends its Stop before the card's write lands", () => {
  it("clears a session we sent even while its row still reads running", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { s1: true },
        rows: board({ s1: "running" }),
        openSessionKey: "s1",
        vmStatus: vm({ s1: "wrapping_up" }),
      }),
      {},
    );
  });

  it("clears a running row started elsewhere", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: {},
        rows: board({ s1: "running", s2: "running" }),
        openSessionKey: null,
        vmStatus: vm({ s1: "wrapping_up" }),
      }),
      { s2: true },
    );
  });

  it("clears a boardless chat", () => {
    deepStrictEqual(
      deriveSessionLoading({
        locallySent: { assistant: true },
        rows: NO_BOARD,
        openSessionKey: "assistant",
        vmStatus: vm({ assistant: "wrapping_up" }),
      }),
      {},
    );
  });
});

describe("the open conversation follows running turns", () => {
  it("starts loading again as soon as the next local or observed turn starts", () => {
    for (const sent of [true, false]) {
      deepStrictEqual(
        deriveSessionLoading({
          locallySent: sent ? { s1: true } : {},
          rows: board({ s1: "needs_you" }),
          openSessionKey: "s1",
          vmStatus: vm({ s1: "running" }),
        }),
        { s1: true },
      );
    }
  });
});

describe("the send hook subscribes to the open conversation's VM", () => {
  const source = readFileSync(
    join(
      import.meta.dirname,
      "../src/components/board/use-agent-board-send.ts",
    ),
    "utf8",
  );

  it("reads the open session's status reactively", () => {
    ok(source.includes("useConversationStatus("));
  });

  it("recomputes the rollup when that status changes", () => {
    const memo = source.slice(source.indexOf("const effectiveLoading"));
    const deps = memo.slice(memo.indexOf("}, ["), memo.indexOf("]);") + 3);
    ok(
      deps.includes("openStatus"),
      "the subscribed VM status must be a dependency of the loading memo",
    );
  });
});
