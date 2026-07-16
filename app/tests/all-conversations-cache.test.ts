import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { latestCachedAllConversations } from "../src/lib/all-conversations-cache.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

describe("latestCachedAllConversations", () => {
  it("returns undefined with no cached aggregate", () => {
    const qc = new QueryClient();
    strictEqual(latestCachedAllConversations(qc), undefined);
  });

  it("serves the newest successful roster variant", () => {
    const qc = new QueryClient();
    const older = [{ id: "old" }];
    const newer = [{ id: "new" }];
    qc.setQueryData(queryKeys.allConversations(["/w/a", "/w/b"]), older, {
      updatedAt: 1_000,
    });
    qc.setQueryData(
      queryKeys.allConversations(["/w/a", "/w/b", "/w/c"]),
      newer,
      {
        updatedAt: 2_000,
      },
    );
    deepStrictEqual(latestCachedAllConversations(qc), newer);
  });

  it("ignores unrelated query keys", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.activity("/w/a"), [{ id: "board-row" }], {
      updatedAt: 5_000,
    });
    strictEqual(latestCachedAllConversations(qc), undefined);
  });
});
