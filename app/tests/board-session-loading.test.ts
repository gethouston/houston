import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  type BoardRows,
  deriveSessionLoading,
  type VmSessionStatus,
} from "../src/components/board/session-loading.ts";

/**
 * The assistant chat has NO activity row by design, so its spinner had nothing
 * to turn it off: the local "we sent" flag survived the turn, and the rollup
 * read a settled conversation as "unknown, assume running" forever.
 * A boardless surface settles from the conversation VM alone.
 */

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
    // The stale-running heal (`confirmIdle`) is the VM's other way of saying a
    // turn is over. With no row to fall back on, reading it as "unknown" left
    // the spinner on for the rest of the session.
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
    // The documented board rule: busy whenever the activity is running, not
    // just when WE started it. An idle/settled VM must never override it.
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
    // An EMPTY board is not a boardless surface: the row for the mission just
    // created has not arrived yet, so an unknown session stays busy.
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
    // The host-persisted row is the board's signal: a settled VM must not
    // clear a card the engine still reports as running.
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
});

describe("the send hook subscribes to the open conversation's VM", () => {
  // The rollup is a `useMemo`: a synchronous VM read alone never wakes it, so a
  // surface whose activity list never refetches (the assistant has none) froze
  // its spinner at send time. The subscription is what makes the settle land.
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
