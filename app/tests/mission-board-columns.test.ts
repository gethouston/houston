import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildMissionBoardColumns } from "../src/components/mission-board-columns.ts";

describe("mission board columns", () => {
  it("wires new mission only to the running column footer", () => {
    const openNewMission = () => {};
    const columns = buildMissionBoardColumns(
      {
        running: "Running",
        needsYou: "Needs you",
        done: "Done",
        newMission: "New mission",
      },
      openNewMission,
    );

    deepStrictEqual(
      columns.map((column) => ({
        id: column.id,
        label: column.label,
        statuses: column.statuses,
      })),
      [
        { id: "running", label: "Running", statuses: ["running"] },
        {
          id: "needs_you",
          label: "Needs you",
          statuses: ["needs_you", "error"],
        },
        { id: "done", label: "Done", statuses: ["done"] },
      ],
    );
    strictEqual(columns[0].onAdd, openNewMission);
    strictEqual(columns[0].addLabel, "New mission");
    strictEqual(columns[1].onAdd, undefined);
    strictEqual(columns[2].onAdd, undefined);
  });
});
