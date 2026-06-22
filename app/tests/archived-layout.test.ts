import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  KANBAN_LIST_RAIL_CLASS_NAME,
  KANBAN_LIST_RAIL_LEFT_CLASS_NAME,
} from "../../ui/board/src/kanban-list-layout.ts";

const searchSource = readFileSync(
  new URL("../src/components/tabs/archived-tab-search.tsx", import.meta.url),
  "utf8",
);
const tabSource = readFileSync(
  new URL("../src/components/tabs/archived-tab.tsx", import.meta.url),
  "utf8",
);

describe("archived mission layout", () => {
  it("keeps a centered column and a full-width left rail variant", () => {
    strictEqual(KANBAN_LIST_RAIL_CLASS_NAME, "mx-auto w-full max-w-2xl");
    // The Archived (left) rail drops the max-w cap so cards fill the pane and
    // shrink with it when the chat panel opens.
    strictEqual(KANBAN_LIST_RAIL_LEFT_CLASS_NAME, "w-full");
  });

  it("left-aligns the archived list and its search on the shared rail", () => {
    ok(
      searchSource.includes(
        'import { KanbanListRail } from "@houston-ai/board";',
      ),
    );
    ok(searchSource.includes('<KanbanListRail align="left">'));
    ok(tabSource.includes('listAlign="left"'));
  });
});
