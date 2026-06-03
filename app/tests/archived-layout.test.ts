import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { KANBAN_LIST_RAIL_CLASS_NAME } from "../../ui/board/src/kanban-list-layout.ts";

const source = readFileSync(
  new URL("../src/components/tabs/archived-tab-search.tsx", import.meta.url),
  "utf8",
);

describe("archived mission layout", () => {
  it("keeps the shared list rail as the left alignment source", () => {
    strictEqual(KANBAN_LIST_RAIL_CLASS_NAME, "mx-auto w-full max-w-2xl");
  });

  it("places archived search on the same rail component as the list", () => {
    ok(source.includes('import { KanbanListRail } from "@houston-ai/board";'));
    ok(source.includes("<KanbanListRail>"));
  });
});
