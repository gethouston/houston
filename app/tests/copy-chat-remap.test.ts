import { deepStrictEqual, notStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { planChatIdMap, remapChatArchive } from "../src/lib/copy-chat-remap.ts";

const mintFrom = (ids: string[]) => {
  let i = 0;
  return () => ids[i++] ?? `extra-${i}`;
};

const conversations = [
  { id: "a1", session_key: "activity-a1" },
  { id: "b2", session_key: "routine-r9" },
  { id: "d4", session_key: "routine-r9-run7" },
];

const routineIds = { r9: "q9" };

describe("planChatIdMap", () => {
  it("mints one id per conversation and derives the copy's key from it", () => {
    const map = planChatIdMap(
      conversations,
      mintFrom(["n1", "n2", "n4"]),
      routineIds,
    );
    deepStrictEqual(
      [...map.activity],
      [
        ["a1", "n1"],
        ["b2", "n2"],
        ["d4", "n4"],
      ],
    );
    deepStrictEqual(
      [...map.session],
      [
        ["activity-a1", "activity-n1"],
        ["routine-r9", "routine-q9"],
        ["routine-r9-run7", "routine-q9-run7"],
      ],
    );
  });

  it("keeps a routine key the install did not re-mint (nothing to follow)", () => {
    const map = planChatIdMap(conversations, mintFrom(["n1", "n2", "n4"]));
    strictEqual(map.session.get("routine-r9"), "routine-r9");
    strictEqual(map.session.get("routine-r9-run7"), "routine-r9-run7");
  });
});

describe("remapChatArchive", () => {
  it("rewrites the board rows, renames transcripts, and leaves the rest alone", () => {
    const map = planChatIdMap(
      conversations,
      mintFrom(["n1", "n2", "n4"]),
      routineIds,
    );
    const board = [
      {
        id: "a1",
        title: "A",
        status: "running",
        claude_session_id: "native-1",
        routine_run_id: "run-1",
      },
      {
        id: "b2",
        title: "B",
        status: "done",
        session_key: "routine-r9",
        routine_id: "r9",
      },
      {
        id: "c3",
        title: "C",
        status: "done",
        origin_session_key: "activity-a1",
        started_by: "employee",
      },
    ];
    const zip = zipSync({
      ".houston/activity/activity.json": strToU8(JSON.stringify(board)),
      ".houston/runtime/conversations/activity-a1.json": strToU8(
        JSON.stringify({ id: "activity-a1", title: "A", messages: [] }),
      ),
      ".houston/runtime/conversations/routine-r9.json": strToU8(
        JSON.stringify({ id: "routine-r9", title: "B", messages: [] }),
      ),
      "notes/keep.txt": strToU8("untouched"),
    });

    const out = unzipSync(remapChatArchive(zip, map, mintFrom(["n3"])));
    deepStrictEqual(Object.keys(out).sort(), [
      ".houston/activity/activity.json",
      ".houston/runtime/conversations/activity-n1.json",
      ".houston/runtime/conversations/routine-q9.json",
      "notes/keep.txt",
    ]);
    const rows = JSON.parse(
      strFromU8(out[".houston/activity/activity.json"] as Uint8Array),
    ) as Record<string, unknown>[];
    deepStrictEqual(
      rows.map((r) => [r.id, r.session_key, r.origin_session_key, r.status]),
      [
        ["n1", undefined, undefined, "needs_you"],
        ["n2", "routine-q9", undefined, "done"],
        ["n3", undefined, "activity-n1", "done"],
      ],
    );
    ok(!("claude_session_id" in (rows[0] as object)));
    ok(!("routine_run_id" in (rows[0] as object)));
    strictEqual(rows[1]?.routine_id, "q9");
    strictEqual(rows[2]?.started_by, "employee");
    const moved = JSON.parse(
      strFromU8(
        out[".houston/runtime/conversations/activity-n1.json"] as Uint8Array,
      ),
    );
    strictEqual(moved.id, "activity-n1");
    strictEqual(moved.needsSessionReplay, true);
    const routineChat = JSON.parse(
      strFromU8(
        out[".houston/runtime/conversations/routine-q9.json"] as Uint8Array,
      ),
    );
    strictEqual(routineChat.needsSessionReplay, true);
    strictEqual(routineChat.id, "routine-q9");
    strictEqual(strFromU8(out["notes/keep.txt"] as Uint8Array), "untouched");
    ok(map.activity.has("c3"));
    notStrictEqual(map.activity.get("c3"), "c3");
  });
});
