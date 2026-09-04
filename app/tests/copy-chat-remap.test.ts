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
  { id: "b2", session_key: "sess-b2" },
];

describe("planChatIdMap", () => {
  it("mints one id per conversation and derives the copy's key from it", () => {
    const map = planChatIdMap(conversations, mintFrom(["n1", "n2"]));
    deepStrictEqual(
      [...map.activity],
      [
        ["a1", "n1"],
        ["b2", "n2"],
      ],
    );
    deepStrictEqual(
      [...map.session],
      [
        ["activity-a1", "activity-n1"],
        ["sess-b2", "activity-n2"],
      ],
    );
  });
});

describe("remapChatArchive", () => {
  it("rewrites the board rows, renames transcripts, and leaves the rest alone", () => {
    const map = planChatIdMap(conversations, mintFrom(["n1", "n2"]));
    const board = [
      { id: "a1", title: "A", status: "done" },
      { id: "b2", title: "B", status: "done", session_key: "sess-b2" },
      // Started by the agent from A's chat: the parent link follows.
      {
        id: "c3",
        title: "C",
        status: "done",
        origin_session_key: "activity-a1",
      },
    ];
    const zip = zipSync({
      ".houston/activity/activity.json": strToU8(JSON.stringify(board)),
      ".houston/runtime/conversations/activity-a1.json": strToU8(
        JSON.stringify({ id: "activity-a1", title: "A", messages: [] }),
      ),
      ".houston/runtime/conversations/sess-b2.json": strToU8(
        JSON.stringify({ id: "sess-b2", title: "B", messages: [] }),
      ),
      "notes/keep.txt": strToU8("untouched"),
    });

    const out = unzipSync(remapChatArchive(zip, map, mintFrom(["n3"])));
    deepStrictEqual(Object.keys(out).sort(), [
      ".houston/activity/activity.json",
      ".houston/runtime/conversations/activity-n1.json",
      ".houston/runtime/conversations/activity-n2.json",
      "notes/keep.txt",
    ]);
    const rows = JSON.parse(
      strFromU8(out[".houston/activity/activity.json"] as Uint8Array),
    ) as Record<string, unknown>[];
    deepStrictEqual(
      rows.map((r) => [r.id, r.session_key, r.origin_session_key]),
      [
        ["n1", undefined, undefined],
        ["n2", "activity-n2", undefined],
        ["n3", undefined, "activity-n1"],
      ],
    );
    strictEqual(
      JSON.parse(
        strFromU8(
          out[".houston/runtime/conversations/activity-n2.json"] as Uint8Array,
        ),
      ).id,
      "activity-n2",
    );
    strictEqual(strFromU8(out["notes/keep.txt"] as Uint8Array), "untouched");
    // The row the conversation list never named still got a fresh id, and the
    // map remembers it for a later batch.
    ok(map.activity.has("c3"));
    notStrictEqual(map.activity.get("c3"), "c3");
  });
});
