import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  missionEditPatches,
  missionRemovalPatches,
} from "../src/lib/mission-cache-patches.ts";
import { runOptimisticWrite } from "../src/lib/optimistic-core.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const ALICE = "/agents/alice";
const BOB = "/agents/bob";
const T = "2026-10-08T12:00:00.000Z";

const activity = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Task ${id}`,
  description: "",
  status: "needs_you",
  ...extra,
});
const row = (id: string, agent_path: string) => ({
  id,
  agent_path,
  title: `Task ${id}`,
  status: "needs_you",
  type: "activity",
});

/** Every cache that paints a card: the agent's list and two roster variants
 *  of the aggregate (a drifted roster leaves its rows under a key of its own). */
function seeded(): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.activity(ALICE), [activity("a1"), activity("a2")]);
  qc.setQueryData(queryKeys.activity(BOB), [activity("b1")]);
  const rows = [row("a1", ALICE), row("a2", ALICE), row("b1", BOB)];
  qc.setQueryData(queryKeys.allConversations([ALICE, BOB]), rows);
  qc.setQueryData(queryKeys.allConversations([ALICE]), rows.slice(0, 2));
  return qc;
}

function paint(
  qc: QueryClient,
  patches: ReturnType<typeof missionEditPatches>,
) {
  for (const patch of patches)
    qc.setQueriesData({ queryKey: patch.queryKey }, patch.apply);
}

const ids = (data: unknown) => (data as { id: string }[]).map((r) => r.id);

describe("missionRemovalPatches", () => {
  it("takes the cards off the agent's list and every aggregate variant", () => {
    const qc = seeded();
    paint(qc, missionRemovalPatches({ [ALICE]: ["a1"], [BOB]: ["b1"] }));
    deepStrictEqual(ids(qc.getQueryData(queryKeys.activity(ALICE))), ["a2"]);
    deepStrictEqual(ids(qc.getQueryData(queryKeys.activity(BOB))), []);
    deepStrictEqual(
      ids(qc.getQueryData(queryKeys.allConversations([ALICE, BOB]))),
      ["a2"],
    );
    deepStrictEqual(ids(qc.getQueryData(queryKeys.allConversations([ALICE]))), [
      "a2",
    ]);
  });

  it("matches an aggregate row by its owning agent, never by id alone", () => {
    const [, aggregate] = missionRemovalPatches({ [BOB]: ["a1"] });
    const rows = [row("a1", ALICE)];
    strictEqual(aggregate.apply(rows), rows);
  });

  it("is idempotent, tolerates an unloaded cache, and keeps an untouched list", () => {
    const [own] = missionRemovalPatches({ [ALICE]: ["a1"] });
    const list = [activity("a1"), activity("a2")];
    const once = own.apply(list);
    deepStrictEqual(own.apply(once), once);
    strictEqual(own.apply(undefined), undefined);
    const other = [activity("a2")];
    strictEqual(own.apply(other), other);
  });
});

describe("missionEditPatches", () => {
  it("moves the cards on every board and stamps the write's time", () => {
    const qc = seeded();
    paint(qc, missionEditPatches({ [ALICE]: ["a1"] }, { status: "done" }, T));
    const own = qc.getQueryData<{ id: string; status: string }[]>(
      queryKeys.activity(ALICE),
    );
    deepStrictEqual(
      own?.map((r) => [r.id, r.status]),
      [
        ["a1", "done"],
        ["a2", "needs_you"],
      ],
    );
    const aggregate = qc.getQueryData<
      { id: string; status: string; updated_at?: string }[]
    >(queryKeys.allConversations([ALICE, BOB]));
    deepStrictEqual(aggregate?.[0], {
      ...row("a1", ALICE),
      status: "done",
      last_message_at: T,
      updated_at: T,
    });
    strictEqual(aggregate?.[2]?.status, "needs_you");
  });

  it("renames without touching the status", () => {
    const [own, aggregate] = missionEditPatches(
      { [ALICE]: ["a1"] },
      { title: "Renamed", status: undefined },
      T,
    );
    const list = own.apply([activity("a1")]) as {
      title: string;
      status: string;
    }[];
    deepStrictEqual([list[0].title, list[0].status], ["Renamed", "needs_you"]);
    const rows = aggregate.apply([row("a1", ALICE)]) as { status: string }[];
    strictEqual(rows[0].status, "needs_you");
  });

  it("clears a blocking interaction on a move to done, as the host does", () => {
    const [own] = missionEditPatches(
      { [ALICE]: ["a1"] },
      { status: "done" },
      T,
    );
    const blocked = activity("a1", {
      pending_interaction: {
        steps: [{ kind: "question", id: "q1", question: "Which deck?" }],
      },
    });
    const [after] = own.apply([blocked]) as Record<string, unknown>[];
    strictEqual(after.status, "done");
    strictEqual("pending_interaction" in after, false);
  });

  it("is idempotent and returns an untouched list as is", () => {
    const [own, aggregate] = missionEditPatches(
      { [ALICE]: ["a1"] },
      { status: "archived" },
      T,
    );
    const once = own.apply([activity("a1")]);
    deepStrictEqual(own.apply(once), once);
    const rows = [row("b1", BOB)];
    strictEqual(aggregate.apply(rows), rows);
    strictEqual(aggregate.apply(undefined), undefined);
  });
});

describe("a mission delete through the optimistic write", () => {
  it("rolls every board back when the host refuses", async () => {
    const qc = seeded();
    const before = qc.getQueryData(queryKeys.allConversations([ALICE, BOB]));
    const refused: string[] = [];
    await runOptimisticWrite(
      {
        qc,
        command: "delete_mission",
        patches: missionRemovalPatches({ [ALICE]: ["a1"] }),
        write: () => Promise.reject(new Error("pod asleep")),
        failure: { title: "t", description: "d" },
      },
      (command) => refused.push(command),
    );
    deepStrictEqual(
      qc.getQueryData(queryKeys.allConversations([ALICE, BOB])),
      before,
    );
    deepStrictEqual(ids(qc.getQueryData(queryKeys.activity(ALICE))), [
      "a1",
      "a2",
    ]);
    deepStrictEqual(refused, ["delete_mission"]);
  });
});

describe("a refused mission write undoes only its own rows", () => {
  const ALL = queryKeys.allConversations([ALICE, BOB]);
  const hang = () => {
    let reject!: (err: Error) => void;
    const promise = new Promise<void>((_, rej) => {
      reject = rej;
    });
    return { promise, reject };
  };

  it("keeps another agent's rows that landed mid-delete", async () => {
    const qc = seeded();
    const host = hang();
    const done = runOptimisticWrite(
      {
        qc,
        command: "delete_mission",
        patches: missionRemovalPatches({ [ALICE]: ["a1"] }),
        write: () => host.promise,
        failure: { title: "t", description: "d" },
      },
      () => {},
    );
    // Bob's event refreshes his slice of the aggregate (`patchAgentSlice`).
    qc.setQueryData(ALL, [row("a2", ALICE), row("b1", BOB), row("b2", BOB)]);
    host.reject(new Error("pod asleep"));
    await done;
    deepStrictEqual(ids(qc.getQueryData(ALL)), ["a1", "a2", "b1", "b2"]);
  });

  it("puts each card of two overlapping refused deletes back", async () => {
    const qc = seeded();
    const first = hang();
    const second = hang();
    const write = (id: string, host: ReturnType<typeof hang>) =>
      runOptimisticWrite(
        {
          qc,
          command: "delete_mission",
          patches: missionRemovalPatches({ [ALICE]: [id] }),
          write: () => host.promise,
          failure: { title: "t", description: "d" },
        },
        () => {},
      );
    const a = write("a1", first);
    const b = write("a2", second);
    first.reject(new Error("boom"));
    await a;
    second.reject(new Error("boom"));
    await b;
    deepStrictEqual(ids(qc.getQueryData(ALL)), ["a1", "a2", "b1"]);
    deepStrictEqual(ids(qc.getQueryData(queryKeys.activity(ALICE))), [
      "a1",
      "a2",
    ]);
  });

  it("restores only the edited fields of a refused move", async () => {
    const qc = seeded();
    const host = hang();
    const done = runOptimisticWrite(
      {
        qc,
        command: "update_mission",
        patches: missionEditPatches({ [ALICE]: ["a1"] }, { status: "done" }, T),
        write: () => host.promise,
        failure: { title: "t", description: "d" },
      },
      () => {},
    );
    // A rename of the same card lands from the host meanwhile.
    qc.setQueryData(ALL, [
      { ...row("a1", ALICE), status: "done", title: "Renamed" },
      row("a2", ALICE),
      row("b1", BOB),
    ]);
    host.reject(new Error("boom"));
    await done;
    const [a1] = qc.getQueryData(ALL) as { status: string; title: string }[];
    strictEqual(a1.status, "needs_you");
    strictEqual(a1.title, "Renamed");
  });
});

const failure = { title: "", description: "" };

/** A write the test refuses by hand, after arranging what landed mid-write. */
function pending(
  qc: QueryClient,
  patches: ReturnType<typeof missionEditPatches>,
) {
  let fail!: (err: Error) => void;
  const done = runOptimisticWrite(
    {
      qc,
      command: "t",
      patches,
      write: () =>
        new Promise<void>((_, rej) => {
          fail = rej;
        }),
      failure,
    },
    () => {},
  );
  return async () => {
    fail(new Error("no"));
    await done;
  };
}

describe("refused mission writes", () => {
  it("leaves a card someone else deleted mid-edit gone", async () => {
    const qc = seeded();
    const refuse = pending(
      qc,
      missionEditPatches({ [ALICE]: ["a1"] }, { title: "New" }, T),
    );
    const key = queryKeys.allConversations([ALICE, BOB]);
    qc.setQueryData(key, [row("a2", ALICE), row("b1", BOB)]);
    await refuse();
    deepStrictEqual(ids(qc.getQueryData(key)), ["a2", "b1"]);
  });

  it("keeps a question already back on the card when a move reverts", () => {
    const [own] = missionEditPatches(
      { [ALICE]: ["a1"] },
      { status: "done" },
      T,
    );
    const raised = {
      steps: [{ kind: "question", id: "q2", question: "Now?" }],
    };
    const old = {
      steps: [{ kind: "question", id: "q1", question: "Before?" }],
    };
    const [kept] = own.revert?.(
      [activity("a1", { status: "done", pending_interaction: raised })],
      [activity("a1", { pending_interaction: old })],
    ) as Record<string, unknown>[];
    deepStrictEqual(
      [kept.status, kept.pending_interaction],
      ["needs_you", raised],
    );
    const [restored] = own.revert?.(
      [activity("a1", { status: "done" })],
      [activity("a1", { pending_interaction: old })],
    ) as Record<string, unknown>[];
    deepStrictEqual(restored.pending_interaction, old);
  });

  it("refetches an aggregate whose first load landed mid-write", async () => {
    const qc = new QueryClient();
    const key = queryKeys.allConversations([ALICE]);
    let landFirst!: (rows: unknown) => void;
    const first = qc.fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise((res) => {
          landFirst = res;
        }),
    });
    const refuse = pending(qc, missionRemovalPatches({ [ALICE]: ["a1"] }));
    landFirst([row("a1", ALICE)]);
    await first;
    deepStrictEqual(ids(qc.getQueryData(key)), []);
    await refuse();
    strictEqual(qc.getQueryState(key)?.isInvalidated, true);
  });
});

it("optimistic aggregate moves backfill the previous time before the host answers", () => {
  const [, aggregate] = missionEditPatches(
    { [ALICE]: ["a1"] },
    { status: "done" },
    T,
  );
  const previous = "2026-10-07T08:00:00.000Z";
  deepStrictEqual(
    aggregate.apply([{ ...row("a1", ALICE), updated_at: previous }]),
    [
      {
        ...row("a1", ALICE),
        status: "done",
        updated_at: T,
        last_message_at: previous,
      },
    ],
  );
});
